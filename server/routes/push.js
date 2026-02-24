// ─── Web Push endpoints ───────────────────────────────────────────────────────
const webpush = require('web-push');
const { verifyEntraTokenAsync, requirePro } = require('../auth');
const { getPrisma }                         = require('../db');

function createPushRoutes(app) {
  // POST /api/push/subscribe — register a push subscription for the current user (PRO+)
  app.post('/api/push/subscribe', requirePro, async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Missing endpoint or keys' });
    }
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    try {
      await db.pushSubscription.upsert({
        where: { endpoint },
        create: { entraOid: identity.oid, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent || null },
        update: { entraOid: identity.oid, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent || null },
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/push/subscribe error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // DELETE /api/push/subscribe — remove a push subscription
  app.delete('/api/push/subscribe', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    try {
      await db.pushSubscription.deleteMany({ where: { endpoint, entraOid: identity.oid } });
      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/push/subscribe error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/push/send — send a push to the current user's subscriptions (cross-device)
  app.post('/api/push/send', requirePro, async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });
    const { title, body, icon, url } = req.body;
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    try {
      const subs = await db.pushSubscription.findMany({ where: { entraOid: identity.oid } });
      const payload = JSON.stringify({ title, body, icon: icon || '/pwa-192x192.png', url: url || '/' });
      let sent = 0;
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            );
            sent++;
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
            }
          }
        })
      );
      return res.json({ ok: true, sent });
    } catch (err) {
      console.error('POST /api/push/send error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });
}

module.exports = { createPushRoutes };
