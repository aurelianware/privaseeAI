require('ts-node/register/transpile-only');

const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fetch = require('node-fetch');
const { default: AutelDroneSDK } = require('./src/services/AutelDroneSDK');
const { default: FlightOrchestrator } = require('./src/services/FlightOrchestrator');
const { WebSocketServer } = require('ws');

const fsp = fs.promises;

const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'dist');

// Drone + orchestrator wiring
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

async function notifyUser(message, data) {
  await logEventToDb({ type: 'notify', message, data, at: new Date().toISOString() });
}

async function persistLog(entry) {
  await logEventToDb({ ...entry, at: new Date().toISOString() });
}

async function persistMediaFrames(frames) {
  if (!frames || !frames.length) return;
  const mediaDir = path.join(__dirname, 'data');
  await fsp.mkdir(mediaDir, { recursive: true });
  const filePath = path.join(mediaDir, `frames-${Date.now()}.json`);
  await fsp.writeFile(filePath, JSON.stringify({ frames: frames.slice(-200) }, null, 2));
  await persistLog({ type: 'media_saved', filePath, frames: frames.length });
}

async function runFrameDetection(frame) {
  // Placeholder: route frame into TensorFlow.js pipeline (browser worker or server inference)
  await persistLog({ type: 'detection_dispatch', frameTimestamp: frame.timestamp });
}

// WebSocket streaming
let wss;
const wsClients = new Set();

function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/drone' });
  wss.on('connection', (socket) => {
    wsClients.add(socket);
    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });
}

function broadcastFrame(frame) {
  if (!wss || wsClients.size === 0) return;
  const payload = {
    type: 'frame',
    frame: {
      ...frame,
      data: typeof frame.data === 'string' ? frame.data : Buffer.from(frame.data).toString('base64')
    }
  };
  const message = JSON.stringify(payload);
  wsClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

const orchestrator = new FlightOrchestrator(drone, {
  weatherApiUrl: process.env.WEATHER_API_URL,
  weatherApiKey: process.env.WEATHER_API_KEY,
  airspaceApiUrl: process.env.AIRSPACE_API_URL,
  minBatteryPct: Number(process.env.MIN_BATTERY_PCT || 60),
  minSatellites: Number(process.env.MIN_SATS || 8),
  notify: notifyUser,
  saveLog: persistLog,
  saveMedia: persistMediaFrames,
  runDetection: runFrameDetection,
  broadcastFrame: broadcastFrame
});

// Azure Key Vault setup
const credential = new DefaultAzureCredential();
const client = new SecretClient('https://websecurityapp-kv.vault.azure.net', credential);

async function getSecret(name) {
  try {
    const secret = await client.getSecret(name);
    return secret.value;
  } catch (error) {
    console.error(`Key Vault error for ${name}:`, error.message);
    return process.env[name.replace('-', '_')];
  }
}

app.use(express.json());

// Security headers
app.use((req, res, next) => {
  // Set frame-ancestors via HTTP header (more secure than meta tag)
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

// Simple in-memory rate limiter (per API key)
const rateLimiter = {
  windowMs: 60_000,
  max: 60,
  buckets: new Map()
};

function checkRateLimit(key) {
  const now = Date.now();
  const bucket = rateLimiter.buckets.get(key) || [];
  const recent = bucket.filter(ts => now - ts < rateLimiter.windowMs);
  recent.push(now);
  rateLimiter.buckets.set(key, recent);
  return recent.length <= rateLimiter.max;
}

// Minimal async queue to serialize drone triggers
const eventQueue = [];
let processingQueue = false;

async function enqueueEvent(handler) {
  eventQueue.push(handler);
  if (processingQueue) return;
  processingQueue = true;
  while (eventQueue.length) {
    const job = eventQueue.shift();
    try {
      // eslint-disable-next-line no-await-in-loop
      await job();
    } catch (error) {
      console.error('Queue job failed:', error.message);
    }
  }
  processingQueue = false;
}

function getApiKeys() {
  const envKeys = process.env.MOTION_WEBHOOK_KEYS || process.env.API_KEYS || '';
  return envKeys.split(',').map(k => k.trim()).filter(Boolean);
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Body must be JSON object';
  const { timestamp, camera_id, location, threat_level, snapshot_url } = body;
  if (!timestamp || isNaN(Date.parse(timestamp))) return 'Invalid or missing timestamp';
  if (!camera_id || typeof camera_id !== 'string') return 'Invalid camera_id';
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return 'Invalid location (lat/lng required)';
  }
  if (typeof threat_level !== 'number') return 'Invalid threat_level';
  if (!snapshot_url || typeof snapshot_url !== 'string') return 'Invalid snapshot_url';
  return null;
}

async function logEventToDb(entry) {
  // TODO: replace with real DB insert; keep non-blocking simulation
  console.log('Event log:', entry);
}

async function triggerDroneLaunch(event, correlationId) {
  await ensureDroneReady();
  const threatEvent = {
    id: correlationId,
    location: { latitude: event.location.lat, longitude: event.location.lng },
    snapshotUrl: event.snapshot_url,
    threatLevel: event.threat_level
  };

  await orchestrator.handleThreat(threatEvent);
}

app.post('/api/webhook/motion', async (req, res) => {
  const providedKey = req.get('x-api-key') || '';
  const allowedKeys = getApiKeys();
  if (!allowedKeys.length) {
    console.warn('No API keys configured; rejecting for safety');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!allowedKeys.includes(providedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!checkRateLimit(providedKey)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const validationError = validatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const correlationId = randomUUID();
  const threatThreshold = Number(process.env.THREAT_THRESHOLD || 3);
  const shouldLaunch = req.body.threat_level >= threatThreshold;

  try {
    await logEventToDb({
      correlationId,
      receivedAt: new Date().toISOString(),
      event: req.body
    });

    if (shouldLaunch) {
      enqueueEvent(async () => {
        await triggerDroneLaunch(req.body, correlationId);
      });
    }

    return res.status(acceptedStatus(shouldLaunch)).json({
      status: 'ok',
      correlationId,
      queued: shouldLaunch
    });
  } catch (error) {
    console.error('Webhook handling failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function acceptedStatus(queued) {
  return queued ? 202 : 200;
}

// ─── Multi-stream RTSP → HLS proxy ───────────────────────────────────────────
// Each stream gets its own subdir: <baseStreamsDir>/<id>/stream.m3u8
// Served at: /streams/<id>/stream.m3u8
const baseStreamsDir = path.join(os.tmpdir(), 'privaseeai-streams');
fs.mkdirSync(baseStreamsDir, { recursive: true });

// Map<id, { id, name, url, process }>
const activeStreams = new Map();

function streamDir(id) {
  return path.join(baseStreamsDir, id);
}

function startStream(id, name, rtspUrl) {
  const existing = activeStreams.get(id);
  if (existing?.process) existing.process.kill('SIGTERM');
  const dir = streamDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const args = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-c:a', 'aac',
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+append_list',
    path.join(dir, 'stream.m3u8')
  ];
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', d => console.log(`[stream:${id}]`, d.toString().trim()));
  proc.on('exit', code => {
    console.log(`[stream:${id}] ffmpeg exited with code ${code}`);
    const entry = activeStreams.get(id);
    if (entry) activeStreams.set(id, { ...entry, process: null });
  });
  activeStreams.set(id, { id, name: name || id, url: rtspUrl, process: proc });
  console.log(`[stream:${id}] Proxying ${rtspUrl} → /streams/${id}/stream.m3u8`);
  return { id, name: name || id, url: rtspUrl, hlsUrl: `/streams/${id}/stream.m3u8` };
}

function stopStream(id) {
  const entry = activeStreams.get(id);
  if (entry?.process) entry.process.kill('SIGTERM');
  activeStreams.delete(id);
}

function streamStatus(id) {
  const entry = activeStreams.get(id);
  if (!entry) return null;
  const hlsPath = path.join(streamDir(id), 'stream.m3u8');
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    active: !!entry.process,
    hlsUrl: fs.existsSync(hlsPath) ? `/streams/${id}/stream.m3u8` : null,
  };
}

// Serve HLS segments for all streams
app.use('/streams', express.static(baseStreamsDir));

// Auto-start thermal from env var (backward compat)
if (process.env.RTSP_THERMAL_URL) {
  startStream('thermal', 'AGM Taipan', process.env.RTSP_THERMAL_URL);
}

// ─── /api/streams CRUD ───────────────────────────────────────────────────────

// List all streams
app.get('/api/streams', (_req, res) => {
  const list = [...activeStreams.values()].map(e => {
    const hlsPath = path.join(streamDir(e.id), 'stream.m3u8');
    return {
      id: e.id,
      name: e.name,
      url: e.url,
      active: !!e.process,
      hlsUrl: fs.existsSync(hlsPath) ? `/streams/${e.id}/stream.m3u8` : null,
    };
  });
  res.json(list);
});

// Start / update a stream  { id, name, url }
app.post('/api/streams', (req, res) => {
  const { id, name, url } = req.body;
  if (!id || !url) return res.status(400).json({ error: 'id and url required' });
  const result = startStream(id, name || id, url);
  res.json(result);
});

// Stop a stream
app.delete('/api/streams/:id', (req, res) => {
  stopStream(req.params.id);
  res.json({ status: 'stopped', id: req.params.id });
});

// ─── Backward-compat /thermal aliases ────────────────────────────────────────
const THERMAL_PROBE_URLS = [
  'rtsp://192.168.10.1:554/stream',
  'rtsp://192.168.10.1:554/live',
  'rtsp://192.168.10.1:554/live/ch0',
  'rtsp://192.168.10.1:554/ch0',
  'rtsp://192.168.10.1/stream',
  'rtsp://192.168.1.1:554/stream',
  'rtsp://192.168.1.1:554/live',
];

// Serve /thermal/* from the thermal stream dir
app.use('/thermal', (req, res, next) => {
  express.static(streamDir('thermal'))(req, res, next);
});

app.post('/api/thermal/start', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  startStream('thermal', 'AGM Taipan', url);
  res.json({ status: 'started', url });
});

app.post('/api/thermal/stop', (_req, res) => {
  stopStream('thermal');
  res.json({ status: 'stopped' });
});

app.get('/api/thermal/status', (_req, res) => {
  const s = streamStatus('thermal');
  res.json(s
    ? { active: s.active, rtspUrl: s.url, hlsUrl: s.hlsUrl }
    : { active: false, rtspUrl: null, hlsUrl: null });
});

app.post('/api/thermal/probe', async (_req, res) => {
  const results = [];
  for (const url of THERMAL_PROBE_URLS) {
    await new Promise((resolve) => {
      const p = spawn('ffprobe', [
        '-rtsp_transport', 'tcp', '-v', 'quiet',
        '-print_format', 'json', '-show_streams',
        '-timeout', '3000000', url
      ]);
      let stdout = '';
      p.stdout.on('data', d => stdout += d);
      p.on('exit', code => {
        results.push({ url, reachable: code === 0, streams: code === 0 ? JSON.parse(stdout || '{}').streams?.length ?? 0 : 0 });
        resolve();
      });
      setTimeout(() => { p.kill(); resolve(); }, 4000);
    });
  }
  const found = results.find(r => r.reachable);
  if (found) startStream('thermal', 'AGM Taipan', found.url);
  res.json({ results, started: found?.url ?? null });
});

// ─── Drone control endpoints ───────────────────────────────────────────────
app.post('/api/drone/pause', async (req, res) => {
  try {
    await ensureDroneReady();
    await drone.hover();
    res.json({ status: 'ok', action: 'pause' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drone/return-home', async (req, res) => {
  try {
    await ensureDroneReady();
    await drone.returnToHome();
    res.json({ status: 'ok', action: 'return-home' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drone/emergency-land', async (req, res) => {
  try {
    await ensureDroneReady();
    await drone.emergencyLand();
    res.json({ status: 'ok', action: 'emergency-land' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drone/status', async (req, res) => {
  try {
    await ensureDroneReady();
    const telemetry = drone.getTelemetry ? drone.getTelemetry() : {};
    res.json({ status: 'connected', telemetry });
  } catch (err) {
    res.json({ status: 'disconnected', error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    auth: 'Auth0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// For any routes that don't match static files, serve the index.html file
app.get('/{*splat}', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`
      <h1>Application Status</h1>
      <p>Dist directory: ${distPath}</p>
      <p>Dist exists: ${fs.existsSync(distPath)}</p>
      <p>Current directory: ${__dirname}</p>
      <p>Files in current directory: ${fs.readdirSync(__dirname).join(', ')}</p>
    `);
  }
});

// Debug endpoint to check authentication flow
app.get('/api/debug/auth', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    message: 'Auth debug endpoint working',
    userAgent: req.get('User-Agent'),
    headers: {
      authorization: req.get('Authorization') ? 'Bearer [PRESENT]' : 'MISSING',
      cookie: req.get('Cookie') ? '[PRESENT]' : 'MISSING'
    },
    url: req.url,
    method: req.method
  });
});

// Serve static files (React build)
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing (SPA)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

setupWebSocket(server);
