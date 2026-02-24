// ─── Autel EVO Lite 640T — drone SDK, orchestrator, and /api/drone/* routes ───
const { randomUUID } = require('crypto');
const { default: AutelDroneSDK }    = require('../src/services/AutelDroneSDK');
const { default: FlightOrchestrator } = require('../src/services/FlightOrchestrator');
const { broadcastFrame }             = require('./drone-ws');
const { broadcastMission }           = require('./mission-ws');
const { notifyUser, persistLog, persistMediaFrames, runFrameDetection } = require('./notifications');
const { startStream }                = require('./streams');
const { requirePro }                 = require('./auth');

// ─── Drone singleton + lazy connection ────────────────────────────────────────
const drone = new AutelDroneSDK();
let droneReadyPromise = null;

async function ensureDroneReady() {
  if (!droneReadyPromise) {
    droneReadyPromise = drone.connect({
      connectionType: 'wifi',
      ssid: process.env.DRONE_SSID || 'EVO-LITE-DEV',
      password: process.env.DRONE_PASSWORD || 'changeme',
      timeout: 15000,
      autoReconnect: true,
      maxReconnectAttempts: 3
    }).catch((error) => {
      console.error('Drone connect failed:', error.message);
      droneReadyPromise = null;
      throw error;
    });
  }
  return droneReadyPromise;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
const orchestrator = new FlightOrchestrator(drone, {
  weatherApiUrl:  process.env.WEATHER_API_URL,
  weatherApiKey:  process.env.WEATHER_API_KEY,
  airspaceApiUrl: process.env.AIRSPACE_API_URL,
  minBatteryPct:  Number(process.env.MIN_BATTERY_PCT || 60),
  minSatellites:  Number(process.env.MIN_SATS || 8),
  notify:         notifyUser,
  saveLog:        persistLog,
  saveMedia:      persistMediaFrames,
  runDetection:   runFrameDetection,
  broadcastFrame: broadcastFrame,
});

// ─── Mission telemetry state ───────────────────────────────────────────────────
let missionTelemetryTimer = null;
let missionEventUnsub = null;

// ─── Route factory ────────────────────────────────────────────────────────────
/**
 * @param {import('express').Application} app
 * @param {{ sendCommandToController: Function }} deps
 */
function createDroneRoutes(app, { sendCommandToController }) {

  // POST /api/drone/connect
  // Pings 192.168.0.1, starts RTSP→HLS for visual + thermal cameras.
  app.post('/api/drone/connect', async (_req, res) => {
    const DRONE_IP     = process.env.DRONE_IP || '192.168.0.1';
    const VISUAL_RTSP  = `rtsp://${DRONE_IP}:554/livestream/streaming`;
    const THERMAL_RTSP = `rtsp://${DRONE_IP}:554/livestream/thermalstreaming`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      await fetch(`http://${DRONE_IP}`, { signal: controller.signal }).catch(() => {});
      clearTimeout(timer);
    } catch {
      return res.json({
        connected: false,
        reason: `Drone not reachable at ${DRONE_IP}. Make sure your Mac is connected to the EVO-LITE-DEV WiFi network, then try again.`,
      });
    }

    const visualResult  = startStream('evo-visual',  'EVO Visual',  VISUAL_RTSP);
    const thermalResult = startStream('evo-thermal', 'EVO Thermal', THERMAL_RTSP);

    res.json({
      connected:  true,
      visualHls:  visualResult.hlsUrl,
      thermalHls: thermalResult.hlsUrl,
    });
  });

  // GET /api/drone/preflight?lat=<lat>&lng=<lng>
  app.get('/api/drone/preflight', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const location = isNaN(lat) || isNaN(lng)
      ? { latitude: 0, longitude: 0 }
      : { latitude: lat, longitude: lng };

    try {
      const result = await drone.validatePreFlight({
        location,
        weatherApiUrl:  process.env.WEATHER_API_URL,
        weatherApiKey:  process.env.WEATHER_API_KEY,
        airspaceApiUrl: process.env.AIRSPACE_API_URL,
        minBatteryPct:  Number(process.env.MIN_BATTERY_PCT || 20),
        minSatellites:  Number(process.env.MIN_SATS || 6),
      });
      res.json({ ok: result.ok, reasons: result.reasons, details: result.details });
    } catch (err) {
      console.error('Preflight error:', err);
      res.status(500).json({ ok: false, reasons: ['Preflight check failed'], details: {} });
    }
  });

  // POST /api/drone/mission/launch
  app.post('/api/drone/mission/launch', async (req, res) => {
    const { template = 'investigate', lat, lng, altitude = 60, radius = 30, speed = 8 } = req.body || {};

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng (numbers) are required' });
    }

    const threatEvent = {
      id: randomUUID(),
      location: { latitude: lat, longitude: lng },
      threatLevel: 5,
    };

    // Override the SDK's default mission plan inputs via env so the template is respected.
    process.env._MISSION_TEMPLATE  = template;
    process.env._MISSION_ALTITUDE  = String(altitude);
    process.env._MISSION_RADIUS    = String(radius);
    process.env._MISSION_SPEED     = String(speed);

    orchestrator.handleThreat(threatEvent).catch(err => {
      console.error('[mission] error:', err);
      broadcastMission('event', { type: 'error', message: String(err), timestamp: new Date().toISOString() });
    });

    if (missionTelemetryTimer) clearInterval(missionTelemetryTimer);
    missionTelemetryTimer = setInterval(async () => {
      try {
        const status   = await drone.getStatus();
        const progress = drone.getMissionProgress();

        broadcastMission('telemetry', {
          lat:              status.location?.latitude  ?? lat,
          lng:              status.location?.longitude ?? lng,
          altitude:         status.altitude  ?? altitude,
          speed:            status.speed     ?? 0,
          battery:          status.battery   ?? 100,
          gpsFix:           status.gpsInfo?.fixType === 3 ? '3d' : status.gpsInfo?.fixType === 2 ? '2d' : 'none',
          distanceFromHome: status.distanceFromHome ?? 0,
        });

        if (progress) {
          broadcastMission('progress', {
            missionName:     template,
            currentWaypoint: progress.currentWaypointIndex  ?? 0,
            totalWaypoints:  progress.totalWaypoints        ?? 1,
            etaSeconds:      progress.estimatedTimeRemaining ?? null,
            status:          orchestrator.getPhase(),
          });
        }

        if (['complete', 'error'].includes(orchestrator.getPhase())) {
          clearInterval(missionTelemetryTimer);
          missionTelemetryTimer = null;
        }
      } catch (e) {
        // non-fatal
      }
    }, 2000);

    if (missionEventUnsub) missionEventUnsub();
    missionEventUnsub = drone.onMissionEvent((evt) => {
      if (evt.type === 'waypoint-reached') {
        broadcastMission('event', { type: 'waypoint', message: `Reached waypoint ${evt.waypointIndex ?? ''}`, timestamp: new Date().toISOString() });
      } else if (evt.type === 'mission-complete') {
        broadcastMission('event', { type: 'complete', message: 'Mission complete', timestamp: new Date().toISOString() });
        broadcastMission('progress', { status: 'complete', currentWaypoint: 1, totalWaypoints: 1 });
      } else if (evt.type === 'mission-error') {
        broadcastMission('event', { type: 'error', message: evt.error || 'Mission error', timestamp: new Date().toISOString() });
      }
    });

    res.json({ status: 'launched', missionId: threatEvent.id });
  });

  // POST /api/drone/pause
  app.post('/api/drone/pause', async (req, res) => {
    sendCommandToController('pause');
    try {
      await ensureDroneReady();
      await drone.hover();
      res.json({ status: 'ok', action: 'pause' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/drone/return-home
  app.post('/api/drone/return-home', async (req, res) => {
    sendCommandToController('return_home');
    try {
      await ensureDroneReady();
      await drone.returnToHome();
      res.json({ status: 'ok', action: 'return-home' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/drone/emergency-land
  app.post('/api/drone/emergency-land', async (req, res) => {
    sendCommandToController('emergency_land');
    try {
      await ensureDroneReady();
      await drone.emergencyLand();
      res.json({ status: 'ok', action: 'emergency-land' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/drone/controller-key — return the RTMP/WS key for the Android app (PRO+)
  app.get('/api/drone/controller-key', requirePro, (_req, res) => {
    const key = process.env.DRONE_CONTROLLER_KEY || '';
    if (!key) {
      return res.status(503).json({ error: 'DRONE_CONTROLLER_KEY not configured on server' });
    }
    res.json({ key });
  });

  // GET /api/drone/status
  app.get('/api/drone/status', async (req, res) => {
    try {
      await ensureDroneReady();
      const telemetry = drone.getTelemetry ? drone.getTelemetry() : {};
      res.json({ status: 'connected', telemetry });
    } catch (err) {
      res.json({ status: 'disconnected', error: err.message });
    }
  });
}

module.exports = { drone, orchestrator, ensureDroneReady, createDroneRoutes };
