// Express middleware + shared request utilities
const express = require('express');

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

// registerMiddleware — call AFTER the Stripe webhook route (which needs raw body)
function registerMiddleware(app) {
  app.use(express.json());

  // Security headers
  app.use((req, res, next) => {
    // Set frame-ancestors via HTTP header (more secure than meta tag)
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  });
}

module.exports = { registerMiddleware, checkRateLimit, enqueueEvent, getApiKeys, validatePayload };
