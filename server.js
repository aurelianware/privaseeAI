require('ts-node/register/transpile-only');

const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const path = require('path');
const fs = require('fs');
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
app.get('*', (req, res) => {
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

setupWebSocket(server);
