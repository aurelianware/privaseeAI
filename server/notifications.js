// Push notifications + logging helpers
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');
const { getPrisma } = require('./db');
const { logEventToDb } = require('./event-log');

const fsp = fs.promises;

// VAPID init — runs once at module load
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@privaseeai.net',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

async function notifyUser(message, data) {
  await logEventToDb({ type: 'notify', message, data, at: new Date().toISOString() });
  sendPushToAllSubscribed({ title: 'PrivaseeAI Alert', body: message, url: '/' }).catch(() => {});
}

/**
 * Send a Web Push notification to every subscribed user who has notifications enabled.
 * Silently removes stale subscriptions (410 Gone).
 */
async function sendPushToAllSubscribed(payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return; // VAPID not configured — skip
  const db = getPrisma();
  if (!db) return;

  try {
    const subscriptions = await db.pushSubscription.findMany();
    if (subscriptions.length === 0) return;

    // Filter to users with notifications = true
    const oids = [...new Set(subscriptions.map(s => s.entraOid))];
    const settings = await db.userSettings.findMany({
      where: { entraOid: { in: oids }, notifications: true },
      select: { entraOid: true },
    });
    const notifyOids = new Set(settings.map(s => s.entraOid));
    const targets = subscriptions.filter(s => notifyOids.has(s.entraOid));

    const pushPayload = JSON.stringify(payload);
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
          );
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
          } else {
            console.warn('Push send failed:', err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error('sendPushToAllSubscribed error:', err);
  }
}

async function persistLog(entry) {
  await logEventToDb({ ...entry, at: new Date().toISOString() });
}

async function persistMediaFrames(frames) {
  if (!frames || !frames.length) return;
  // One level up from server/ to reach project root data/
  const mediaDir = path.join(__dirname, '..', 'data');
  await fsp.mkdir(mediaDir, { recursive: true });
  const filePath = path.join(mediaDir, `frames-${Date.now()}.json`);
  await fsp.writeFile(filePath, JSON.stringify({ frames: frames.slice(-200) }, null, 2));
  await persistLog({ type: 'media_saved', filePath, frames: frames.length });
}

async function runFrameDetection(frame) {
  // Placeholder: route frame into TensorFlow.js pipeline (browser worker or server inference)
  await persistLog({ type: 'detection_dispatch', frameTimestamp: frame.timestamp });
}

module.exports = { notifyUser, sendPushToAllSubscribed, persistLog, persistMediaFrames, runFrameDetection };
