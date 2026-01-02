import 'dotenv/config';
import express from 'express';
import AutelDroneSDK, { WaypointMission } from '../services/AutelDroneSDK';

const app = express();
app.use(express.json());

const port = Number(process.env.MVP_PORT || 4001);
const drone = new AutelDroneSDK();
let connected = false;

async function ensureConnected() {
  if (connected) return;
  await drone.connect({
    connectionType: 'wifi',
    ssid: process.env.DRONE_SSID || 'EVO-LITE-DEV',
    password: process.env.DRONE_PASSWORD || 'changeme',
    timeout: 20000,
    autoReconnect: true,
    maxReconnectAttempts: 3
  });
  connected = true;
  console.log('[MVP] Connected to drone');
}

function validateBody(body: any) {
  if (!body || typeof body !== 'object') throw new Error('Body required');
  const { latitude, longitude, altitude, action } = body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') throw new Error('latitude/longitude required as numbers');
  if (altitude != null && typeof altitude !== 'number') throw new Error('altitude must be number');
  if (action !== 'investigate') throw new Error('action must be "investigate"');
  return { latitude, longitude, altitude: altitude ?? 40 }; // default 40m
}

async function preflight() {
  const status = await drone.getStatus();
  if (status.battery.percentage < 60) throw new Error('Battery below 60%');
  if (status.gps.fixStatus !== '3d-fix' || status.gps.satelliteCount < 8) throw new Error('GPS lock unavailable');
  return status;
}

function buildMission(status: Awaited<ReturnType<typeof drone.getStatus>>, target: { latitude: number; longitude: number; altitude: number }): WaypointMission {
  const home = {
    latitude: status.gps.latitude,
    longitude: status.gps.longitude,
    altitude: status.altitude || status.gps.altitude
  };

  const waypoints = [
    { index: 0, latitude: home.latitude, longitude: home.longitude, altitude: target.altitude, hoverTime: 0 },
    { index: 1, latitude: target.latitude, longitude: target.longitude, altitude: target.altitude, hoverTime: 30, action: 'hover' },
    { index: 2, latitude: home.latitude, longitude: home.longitude, altitude: target.altitude, hoverTime: 0 }
  ];

  return {
    name: `mvp-${Date.now()}`,
    waypoints,
    flightSpeed: 6,
    finishAction: 'return-to-home',
    headingMode: 'auto'
  };
}

app.post('/api/mvp/mission', async (req, res) => {
  try {
    console.log('[MVP] Received mission request', req.body);
    const { latitude, longitude, altitude } = validateBody(req.body);
    await ensureConnected();

    const status = await preflight();
    console.log('[MVP] Preflight passed', { battery: status.battery.percentage, gps: status.gps.fixStatus });

    await drone.takeoff(altitude);
    console.log('[MVP] Takeoff complete');

    const mission = buildMission(status, { latitude, longitude, altitude });
    await drone.startWaypointMission(mission);
    console.log('[MVP] Mission started', mission.name);

    res.json({ ok: true, mission: mission.name });
  } catch (error: any) {
    console.error('[MVP] Mission failed', error);
    res.status(400).json({ ok: false, error: error.message || 'Mission failed' });
  }
});

app.get('/api/mvp/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`[MVP] Server running on port ${port}`);
});
