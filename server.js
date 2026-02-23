require('ts-node/register/transpile-only');
// Load .env.local in development (Vite handles this for the frontend automatically)
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID, createCipheriv, createDecipheriv, randomBytes, createHmac } = require('crypto');
const { default: AutelDroneSDK } = require('./src/services/AutelDroneSDK');
const { default: FlightOrchestrator } = require('./src/services/FlightOrchestrator');
const { WebSocketServer } = require('ws');

// Prisma client — lazy init so server starts even without DB
// Prisma 7 requires a driver adapter (dropped traditional library engine).
// Using @prisma/adapter-pg with the pg Pool for PostgreSQL connections.
let prisma = null;
function getPrisma() {
  if (!prisma) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const { Pool } = require('pg');
      const { PrismaPg } = require('@prisma/adapter-pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });
    } catch (e) {
      console.warn('⚠️  Prisma unavailable (no DB?):', e.message);
    }
  }
  return prisma;
}

// Stripe client — lazy init
let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) { console.warn('⚠️  STRIPE_SECRET_KEY not set'); return null; }
    try {
      const Stripe = require('stripe');
      stripeClient = new Stripe(key, { apiVersion: '2026-01-28.clover' });
    } catch (e) {
      console.warn('⚠️  Stripe unavailable:', e.message);
    }
  }
  return stripeClient;
}

// requirePro middleware — gates cloud-only endpoints behind PRO/ENTERPRISE
async function requirePro(req, res, next) {
  const identity = extractEntraOid(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPrisma();
  if (!db) return next(); // no DB → allow (dev mode)
  try {
    const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    const tier = settings?.subscriptionTier || 'FREE';
    if (tier === 'FREE') {
      return res.status(403).json({
        error: 'PRO or ENTERPRISE subscription required',
        upgradeUrl: '/pricing',
        currentTier: 'FREE',
      });
    }
    next();
  } catch (err) {
    console.error('requirePro error:', err);
    next(); // fail open to avoid locking out users on DB blip
  }
}

// ─── AES-256-GCM helpers ───────────────────────────────────────────────────────
// Key must be 32 bytes hex in SETTINGS_ENCRYPTION_KEY env var.
// Automatically generated and printed once if missing.
function getEncryptionKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || Buffer.from(raw, 'hex').length !== 32) {
    const generated = randomBytes(32).toString('hex');
    console.warn('⚠️  SETTINGS_ENCRYPTION_KEY missing or invalid. Add this to .env.local:\n' +
      `SETTINGS_ENCRYPTION_KEY=${generated}`);
    // Use the generated key for this session (not persistent — set it properly!)
    process.env.SETTINGS_ENCRYPTION_KEY = generated;
    return Buffer.from(generated, 'hex');
  }
  return Buffer.from(raw, 'hex');
}

function encryptValue(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(stored) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

// ─── Managed Azure Blob Storage helpers ───────────────────────────────────────

/** Derive a valid Azure container name from an Entra OID GUID.
 *  Container names: 3–63 lowercase alphanumeric + hyphens, start/end with letter/number. */
function sanitizeOidForContainer(oid) {
  return ('user-' + oid.replace(/-/g, '')).slice(0, 63).toLowerCase();
}

/** Generate a short-lived, container-scoped SAS token signed with the storage account key.
 *  Returns the raw SAS query string (no leading '?'). */
function generateContainerSas(containerName, durationMinutes = 60) {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey  = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!accountName || !accountKey) {
    throw new Error('AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY are required for managed storage');
  }

  const now    = new Date();
  const start  = new Date(now.getTime() - 60_000); // 1 min back for clock skew
  const expiry = new Date(now.getTime() + durationMinutes * 60_000);
  const fmt    = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const sv = '2022-11-02'; // signed service version
  const ss = 'b';          // blob service only
  const srt = 'co';        // container + object
  const sp = 'rwdlac';     // read, write, delete, list, add, create
  const se = fmt(expiry);
  const st = fmt(start);
  const spr = 'https';

  // String-to-sign for Account SAS (service version 2020-12-06+)
  // Exactly 10 components, each followed by \n (trailing \n required)
  // Ref: https://learn.microsoft.com/en-us/rest/api/storageservices/create-account-sas
  const stringToSign =
    accountName + '\n' +
    sp          + '\n' +  // signedPermissions
    ss          + '\n' +  // signedServices
    srt         + '\n' +  // signedResourceTypes
    st          + '\n' +  // signedStart
    se          + '\n' +  // signedExpiry
                  '\n' +  // signedIP (empty = any)
    spr         + '\n' +  // signedProtocol
    sv          + '\n' +  // signedVersion
                  '\n';   // signedEncryptionScope (empty)

  const keyBytes = Buffer.from(accountKey, 'base64');
  const sig = createHmac('sha256', keyBytes).update(stringToSign, 'utf8').digest('base64');

  return `sv=${sv}&ss=${ss}&srt=${srt}&sp=${encodeURIComponent(sp)}&st=${encodeURIComponent(st)}&se=${encodeURIComponent(se)}&spr=${spr}&sig=${encodeURIComponent(sig)}`;
}

/** Idempotently create an Azure Blob container for the user and mark DB.
 *  Uses a long-lived admin SAS stored in AZURE_ADMIN_SAS for container creation. */
async function provisionUserContainer(entraOid, db) {
  const accountName  = process.env.AZURE_STORAGE_ACCOUNT;
  const adminSas     = process.env.AZURE_ADMIN_SAS;
  if (!accountName || !adminSas) {
    throw new Error('AZURE_STORAGE_ACCOUNT and AZURE_ADMIN_SAS are required for container provisioning');
  }

  const containerName = sanitizeOidForContainer(entraOid);
  const url = `https://${accountName}.blob.core.windows.net/${containerName}?restype=container&${adminSas}`;

  const res = await fetch(url, { method: 'PUT', headers: { 'x-ms-version': '2022-11-02' } });
  // 201 = created, 409 = already exists — both are success
  if (res.status !== 201 && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Container provisioning failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  if (db) {
    await db.userSettings.update({
      where: { entraOid },
      data: { managedContainer: true },
    });
  }

  return containerName;
}

// ─── Extract Entra OID from Bearer JWT (trusted since it comes from MSAL) ─────
function extractEntraOid(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(auth.split('.')[1], 'base64url').toString('utf8')
    );
    return { oid: payload.oid || payload.sub, email: payload.preferred_username || payload.email || null };
  } catch {
    return null;
  }
}

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

// ─── WebRTC Signaling WebSocket (/ws/signal) ──────────────────────────────────
// Pure relay — the server never touches media.  All video flows peer-to-peer
// via DTLS-SRTP after the ICE handshake.
//
// In-memory state (lost on restart — rooms are transient by design).
const signalingUserSockets = new Map();  // entraOid → { ws, displayName }
const signalingRooms       = new Map();  // roomId   → Set<entraOid>
const signalingTokens      = new Map();  // token    → { roomId, expiresAt }

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, { expiresAt }] of signalingTokens) {
    if (now > expiresAt) signalingTokens.delete(token);
  }
}

function broadcastOnlineUsers() {
  const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
  const msg = JSON.stringify({ type: 'online_users', users: list });
  for (const { ws } of signalingUserSockets.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function relayTo(targetOid, payload) {
  const target = signalingUserSockets.get(targetOid);
  if (target && target.ws.readyState === 1) {
    target.ws.send(JSON.stringify(payload));
  }
}

function setupSignalingWebSocket(server) {
  const sigWss = new WebSocketServer({ server, path: '/ws/signal' });

  sigWss.on('connection', (ws) => {
    let myOid = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'register': {
          myOid = msg.entraOid;
          if (!myOid) break;
          signalingUserSockets.set(myOid, { ws, displayName: msg.displayName || myOid });
          // Send the joining user the current online list
          const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
          ws.send(JSON.stringify({ type: 'online_users', users: list }));
          // Notify others
          broadcastOnlineUsers();
          break;
        }

        case 'create_room': {
          if (!myOid) break;
          cleanExpiredTokens();
          const roomId = randomUUID();
          const token  = randomUUID();
          signalingRooms.set(roomId, new Set([myOid]));
          signalingTokens.set(token, { roomId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
          ws.send(JSON.stringify({ type: 'room_created', roomId, token }));
          break;
        }

        case 'join_room': {
          if (!myOid) break;
          let roomId = msg.roomId;
          // Support invite token
          if (!roomId && msg.token) {
            const entry = signalingTokens.get(msg.token);
            if (!entry || Date.now() > entry.expiresAt) {
              ws.send(JSON.stringify({ type: 'error', code: 'token_expired' }));
              break;
            }
            roomId = entry.roomId;
          }
          if (!roomId || !signalingRooms.has(roomId)) {
            ws.send(JSON.stringify({ type: 'error', code: 'room_not_found' }));
            break;
          }
          const room = signalingRooms.get(roomId);
          if (room.size >= 6) {
            ws.send(JSON.stringify({ type: 'error', code: 'room_full' }));
            break;
          }
          // Notify existing members about the new peer
          for (const peerOid of room) {
            relayTo(peerOid, { type: 'peer_joined', peerOid: myOid, displayName: signalingUserSockets.get(myOid)?.displayName || myOid, roomId });
          }
          room.add(myOid);
          // Tell the joiner who's already in the room
          const peers = [...room].filter(o => o !== myOid).map(o => ({ oid: o, displayName: signalingUserSockets.get(o)?.displayName || o }));
          ws.send(JSON.stringify({ type: 'room_joined', roomId, peers }));
          break;
        }

        case 'leave_room': {
          if (!myOid) break;
          for (const [roomId, room] of signalingRooms) {
            if (room.has(myOid)) {
              room.delete(myOid);
              for (const peerOid of room) {
                relayTo(peerOid, { type: 'peer_left', peerOid: myOid });
              }
              if (room.size === 0) signalingRooms.delete(roomId);
            }
          }
          break;
        }

        case 'call_invite': {
          if (!myOid || !msg.targetOid || !msg.roomId) break;
          relayTo(msg.targetOid, {
            type: 'call_invite',
            fromOid: myOid,
            displayName: signalingUserSockets.get(myOid)?.displayName || myOid,
            roomId: msg.roomId,
            token: msg.token,
          });
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice_candidate': {
          if (!myOid || !msg.targetOid) break;
          relayTo(msg.targetOid, { ...msg, fromOid: myOid });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!myOid) return;
      signalingUserSockets.delete(myOid);
      // Remove from all rooms
      for (const [roomId, room] of signalingRooms) {
        if (room.has(myOid)) {
          room.delete(myOid);
          for (const peerOid of room) {
            relayTo(peerOid, { type: 'peer_left', peerOid: myOid });
          }
          if (room.size === 0) signalingRooms.delete(roomId);
        }
      }
      broadcastOnlineUsers();
    });

    ws.on('error', () => ws.terminate());
  });
}

// ─── Signaling REST helpers ────────────────────────────────────────────────────

// GET /api/signal/users/search?q=<email or name>
// Returns users from the DB whose email or name contains the query.
app.get('/api/signal/users/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const db = getPrisma();
  if (!db) return res.json([]);
  try {
    const users = await db.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name:  { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });
    // Annotate with online status
    const onlineSet = new Set(signalingUserSockets.keys());
    res.json(users.map(u => ({ ...u, online: onlineSet.has(u.id) })));
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/signal/users/online
app.get('/api/signal/users/online', (_, res) => {
  const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
  res.json(list);
});

// POST /api/signal/rooms  →  { roomId, token }
app.post('/api/signal/rooms', (req, res) => {
  cleanExpiredTokens();
  const roomId = randomUUID();
  const token  = randomUUID();
  signalingRooms.set(roomId, new Set());
  signalingTokens.set(token, { roomId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  res.json({ roomId, token });
});

// GET /api/signal/rooms/:token  →  { roomId } or 404
app.get('/api/signal/rooms/:token', (req, res) => {
  const entry = signalingTokens.get(req.params.token);
  if (!entry || Date.now() > entry.expiresAt) return res.status(404).json({ error: 'Token not found or expired' });
  res.json({ roomId: entry.roomId });
});

// ─── Mission WebSocket (/ws/mission) ─────────────────────────────────────────
// Pushes telemetry, progress, alerts, and events to MissionDashboard clients.
// Keeps media (raw frames) separate — those still flow through /ws/drone.
const missionWsClients = new Set();

function setupMissionWebSocket(server) {
  const missionWss = new WebSocketServer({ server, path: '/ws/mission' });
  missionWss.on('connection', (ws) => {
    missionWsClients.add(ws);
    ws.on('close', () => missionWsClients.delete(ws));
    ws.on('error', () => missionWsClients.delete(ws));
  });
}

function broadcastMission(type, data) {
  if (missionWsClients.size === 0) return;
  const msg = JSON.stringify({ type, data });
  for (const ws of missionWsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ─── Autel EVO Lite 640T — connection + mission APIs ─────────────────────────

// POST /api/drone/connect
// Pings 192.168.0.1, starts RTSP→HLS for visual + thermal cameras.
// Returns { connected, visualHls, thermalHls, reason? }
app.post('/api/drone/connect', async (_req, res) => {
  const DRONE_IP  = process.env.DRONE_IP || '192.168.0.1';
  const VISUAL_RTSP  = `rtsp://${DRONE_IP}:554/livestream/streaming`;
  const THERMAL_RTSP = `rtsp://${DRONE_IP}:554/livestream/thermalstreaming`;

  // Quick reachability check (HTTP ping — drone exposes a simple HTTP server)
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
// Runs validatePreFlight via the SDK and returns a flat checklist.
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
// Launches an autonomous mission and starts broadcasting telemetry.
// Body: { template: 'patrol'|'investigate'|'perimeter', lat, lng, altitude?, radius?, speed? }
let missionTelemetryTimer = null;
let missionEventUnsub = null;

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
  // The orchestrator always calls planMission internally; we patch its template via env.
  process.env._MISSION_TEMPLATE  = template;
  process.env._MISSION_ALTITUDE  = String(altitude);
  process.env._MISSION_RADIUS    = String(radius);
  process.env._MISSION_SPEED     = String(speed);

  // Kick off the mission (non-blocking)
  orchestrator.handleThreat(threatEvent).catch(err => {
    console.error('[mission] error:', err);
    broadcastMission('event', { type: 'error', message: String(err), timestamp: new Date().toISOString() });
  });

  // Start telemetry broadcast loop
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
          missionName:    template,
          currentWaypoint: progress.currentWaypointIndex  ?? 0,
          totalWaypoints:  progress.totalWaypoints        ?? 1,
          etaSeconds:      progress.estimatedTimeRemaining ?? null,
          status:          orchestrator.getPhase(),
        });
      }

      // Stop loop when mission is done
      if (['complete', 'error'].includes(orchestrator.getPhase())) {
        clearInterval(missionTelemetryTimer);
        missionTelemetryTimer = null;
      }
    } catch (e) {
      // non-fatal
    }
  }, 2000);

  // Subscribe to drone events → broadcast as alerts / events
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

// ─── Stripe webhook — MUST be registered before express.json() ───────────────
// Stripe requires the raw request body to verify the signature.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe unavailable' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('⚠️  STRIPE_WEBHOOK_SECRET not set — rejecting webhook');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getPrisma();
  if (!db) return res.json({ received: true }); // no DB — ack and skip

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const entraOid = session.metadata?.entraOid;
        if (entraOid && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = subscription.items.data[0]?.price?.id;
          const tier = priceId === process.env.STRIPE_PRO_PRICE_ID ? 'PRO'
                     : priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID ? 'ENTERPRISE'
                     : 'FREE';
          await db.userSettings.upsert({
            where: { entraOid },
            create: {
              entraOid,
              subscriptionTier: tier,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              subscriptionStatus: 'active',
              subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            },
            update: {
              subscriptionTier: tier,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              subscriptionStatus: 'active',
              subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            },
          });
          console.log(`✅ Subscription activated for OID ${entraOid} → ${tier}`);
          // Fast-path: provision managed container immediately (GET /api/user/settings will also handle lazily)
          if (['PRO', 'ENTERPRISE'].includes(tier)) {
            provisionUserContainer(entraOid, db).catch(err =>
              console.error('[STORAGE] Container provision failed in webhook:', err.message)
            );
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId === process.env.STRIPE_PRO_PRICE_ID ? 'PRO'
                   : priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID ? 'ENTERPRISE'
                   : 'FREE';
        await db.userSettings.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscriptionTier: tier,
            subscriptionStatus: subscription.status,
            subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await db.userSettings.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscriptionTier: 'FREE',
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
          },
        });
        break;
      }

      default:
        // Unhandled event type — ack anyway
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

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

// Daily-rotating JSONL log directory
const eventLogDir = path.join(__dirname, 'logs');

async function logEventToDb(entry) {
  const record = { ...entry, at: entry.at || new Date().toISOString() };

  // Always log to console for observability
  console.log('[EVENT]', JSON.stringify(record));

  // Non-blocking file persistence — append to logs/events-YYYY-MM-DD.jsonl
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(eventLogDir, `events-${date}.jsonl`);
  fsp.mkdir(eventLogDir, { recursive: true })
    .then(() => fsp.appendFile(logFile, JSON.stringify(record) + '\n'))
    .catch(err => console.error('[EVENT] Failed to write event log:', err.message));
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

// ─── User Settings API (multi-tenant, per-user persisted credentials) ─────────

// GET /api/user/settings — load settings for the authenticated user
app.get('/api/user/settings', async (req, res) => {
  const identity = extractEntraOid(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

  const db = getPrisma();
  if (!db) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const record = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    if (!record) return res.json(null);

    const isPaidTier = ['PRO', 'ENTERPRISE'].includes(record.subscriptionTier);

    // Managed storage: lazy-provision container for paid users, then return a fresh short-lived SAS
    if (isPaidTier && process.env.AZURE_STORAGE_ACCOUNT_KEY && process.env.AZURE_ADMIN_SAS) {
      try {
        const containerName = await provisionUserContainer(identity.oid, db);
        const sas = generateContainerSas(containerName, 60);
        return res.json({
          azureAccountName: process.env.AZURE_STORAGE_ACCOUNT,
          azureContainerName: containerName,
          sasToken: sas,
          managedContainer: true,
          confidenceThreshold: record.confidenceThreshold,
          humanDetection: record.humanDetection,
          motionDetection: record.motionDetection,
          notifications: record.notifications,
          cloudSync: record.cloudSync,
          subscriptionTier: record.subscriptionTier,
          subscriptionStatus: record.subscriptionStatus,
          subscriptionCurrentPeriodEnd: record.subscriptionCurrentPeriodEnd,
        });
      } catch (storageErr) {
        console.error('GET /api/user/settings managed storage error:', storageErr.message);
        // Fall through to legacy BYOS response rather than failing the whole request
      }
    }

    // Legacy BYOS path — decrypt stored SAS token
    const sasToken = record.encryptedSasToken ? decryptValue(record.encryptedSasToken) : null;
    res.json({
      azureAccountName: record.azureAccountName,
      azureContainerName: record.azureContainerName,
      sasToken,
      managedContainer: record.managedContainer,
      confidenceThreshold: record.confidenceThreshold,
      humanDetection: record.humanDetection,
      motionDetection: record.motionDetection,
      notifications: record.notifications,
      cloudSync: record.cloudSync,
      subscriptionTier: record.subscriptionTier,
      subscriptionStatus: record.subscriptionStatus,
      subscriptionCurrentPeriodEnd: record.subscriptionCurrentPeriodEnd,
    });
  } catch (err) {
    console.error('GET /api/user/settings error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUT /api/user/settings — upsert settings for the authenticated user
app.put('/api/user/settings', async (req, res) => {
  const identity = extractEntraOid(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

  const db = getPrisma();
  if (!db) return res.status(503).json({ error: 'Database unavailable' });

  const {
    azureAccountName, azureContainerName, sasToken,
    confidenceThreshold, humanDetection, motionDetection, notifications, cloudSync
  } = req.body;

  try {
    // Check if this is a managed-container user — if so, ignore client-submitted storage fields
    const existing = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    const isManaged = existing?.managedContainer === true;

    const data = {
      email: identity.email,
      // Storage fields: only accept from client when user manages their own container
      ...(!isManaged && azureAccountName !== undefined && { azureAccountName }),
      ...(!isManaged && azureContainerName !== undefined && { azureContainerName }),
      ...(!isManaged && sasToken !== undefined && { encryptedSasToken: sasToken ? encryptValue(sasToken) : null }),
      // Preference fields always accepted
      ...(confidenceThreshold !== undefined && { confidenceThreshold }),
      ...(humanDetection !== undefined && { humanDetection }),
      ...(motionDetection !== undefined && { motionDetection }),
      ...(notifications !== undefined && { notifications }),
      ...(cloudSync !== undefined && { cloudSync }),
    };

    const record = await db.userSettings.upsert({
      where: { entraOid: identity.oid },
      create: { entraOid: identity.oid, ...data },
      update: data,
    });

    res.json({ ok: true, updatedAt: record.updatedAt });
  } catch (err) {
    console.error('PUT /api/user/settings error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Stripe billing endpoints ─────────────────────────────────────────────────

// POST /api/stripe/create-checkout-session
// Body: { planType: 'PRO' | 'ENTERPRISE' | 'FREE' }
// Returns: { checkoutUrl: string | null }
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  const identity = extractEntraOid(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

  const { planType } = req.body;
  const db = getPrisma();

  // FREE plan — activate immediately, no Stripe
  if (!planType || planType === 'FREE') {
    if (db) {
      await db.userSettings.upsert({
        where: { entraOid: identity.oid },
        create: { entraOid: identity.oid, email: identity.email, subscriptionTier: 'FREE', subscriptionStatus: 'active' },
        update: { subscriptionTier: 'FREE', subscriptionStatus: 'active', stripeSubscriptionId: null },
      });
    }
    return res.json({ checkoutUrl: null });
  }

  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ message: 'Stripe unavailable — check STRIPE_SECRET_KEY' });

  const priceId = planType === 'PRO'
    ? process.env.STRIPE_PRO_PRICE_ID
    : planType === 'ENTERPRISE'
    ? process.env.STRIPE_ENTERPRISE_PRICE_ID
    : null;

  if (!priceId) return res.status(400).json({ message: `Invalid plan type: ${planType}` });

  const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;

  // Reuse existing Stripe customer if we have one — DB failure is non-fatal here
  let customerId;
  if (db) {
    try {
      const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
      customerId = settings?.stripeCustomerId;
    } catch (dbErr) {
      console.warn('DB lookup failed during checkout (proceeding without customer ID):', dbErr.message);
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}&subscription=success`,
      cancel_url: `${baseUrl}/?subscription=canceled`,
      metadata: { entraOid: identity.oid },
      ...(identity.email && !customerId && { customer_email: identity.email }),
      ...(customerId && { customer: customerId }),
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
});

// GET /api/stripe/subscription-status
// Returns: { tier: string, status: string, currentPeriodEnd: string | null }
app.get('/api/stripe/subscription-status', async (req, res) => {
  const identity = extractEntraOid(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

  const db = getPrisma();
  if (!db) return res.json({ tier: 'FREE', status: 'active', currentPeriodEnd: null });

  try {
    const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    res.json({
      tier: settings?.subscriptionTier || 'FREE',
      status: settings?.subscriptionStatus || 'active',
      currentPeriodEnd: settings?.subscriptionCurrentPeriodEnd ?? null,
    });
  } catch (err) {
    console.error('Subscription status error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// Serve static files (React build)
// Hashed assets (JS/CSS) → cache forever; everything else → no cache
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders(res, filePath) {
    if (/\/assets\//.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  }
}));

// Handle client-side routing (SPA) — never cache the shell
app.get('/{*splat}', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ─── Startup env validation ───────────────────────────────────────────────────
// Warn clearly about missing config so prod log grep is easy.
function checkEnv() {
  const required = [
    { key: 'DATABASE_URL',              impact: 'User settings and subscription data will not persist' },
    { key: 'STRIPE_SECRET_KEY',         impact: 'Billing/checkout will be unavailable' },
    { key: 'STRIPE_WEBHOOK_SECRET',     impact: 'Stripe webhooks will be rejected (subscription updates broken)' },
    { key: 'STRIPE_PRO_PRICE_ID',       impact: 'PRO checkout sessions will fail' },
    { key: 'STRIPE_ENTERPRISE_PRICE_ID',impact: 'ENTERPRISE checkout sessions will fail' },
    { key: 'SETTINGS_ENCRYPTION_KEY',   impact: 'User settings will use a one-time key (lost on restart)' },
    { key: 'AZURE_STORAGE_ACCOUNT',     impact: 'Managed per-user storage will be unavailable (PRO/ENTERPRISE)' },
    { key: 'AZURE_STORAGE_ACCOUNT_KEY', impact: 'Server-generated SAS tokens will fail (managed storage broken)' },
    { key: 'AZURE_ADMIN_SAS',           impact: 'Container provisioning will fail (new PRO/ENTERPRISE users get no storage)' },
  ];
  const missing = required.filter(({ key }) => !process.env[key]);
  if (missing.length) {
    console.warn('\n⚠️  MISSING ENVIRONMENT VARIABLES:');
    missing.forEach(({ key, impact }) =>
      console.warn(`   • ${key.padEnd(30)} → ${impact}`)
    );
    console.warn('   Set these in .env.local (dev) or your container/ACA secrets (prod)\n');
  }
}
checkEnv();

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

setupWebSocket(server);
setupSignalingWebSocket(server);
setupMissionWebSocket(server);
