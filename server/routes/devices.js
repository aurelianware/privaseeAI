// ─── Device registry endpoints ────────────────────────────────────────────────
const { verifyEntraTokenAsync } = require('../auth');
const { getPrisma }             = require('../db');

// Device limits per subscription tier (mirrors SUBSCRIPTION_PLANS in stripe.ts)
const DEVICE_LIMITS = { FREE: 2, PRO: 10, ENTERPRISE: Infinity };

function createDeviceRoutes(app) {
  // GET /api/devices — list all devices registered by the current user
  app.get('/api/devices', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const db = getPrisma();
    if (!db) return res.json([]);
    try {
      const devices = await db.device.findMany({
        where: { entraOid: identity.oid },
        orderBy: { lastSeen: 'desc' },
      });
      return res.json(devices);
    } catch (err) {
      console.error('GET /api/devices error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/devices — register or update a device (upsert by entraOid + name + type)
  app.post('/api/devices', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const { name, type, platform, status, location, ipAddress, macAddress, capabilities, configuration } = req.body;
    if (!name || !type || !platform) return res.status(400).json({ error: 'name, type, and platform are required' });
    try {
      const existing = await db.device.findFirst({ where: { entraOid: identity.oid, name, type } });

      // Enforce per-tier device limit only when creating a new device (not updating an existing one)
      if (!existing) {
        const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
        const tier = (settings?.subscriptionTier || 'FREE').toUpperCase();
        const limit = DEVICE_LIMITS[tier] ?? DEVICE_LIMITS.FREE;
        const currentCount = await db.device.count({ where: { entraOid: identity.oid } });
        if (currentCount >= limit) {
          return res.status(403).json({
            error: `Device limit reached for ${tier} plan (${limit} device${limit === 1 ? '' : 's'})`,
            limit,
            upgradeUrl: '/billing',
          });
        }
      }

      let device;
      if (existing) {
        device = await db.device.update({
          where: { id: existing.id },
          data: {
            platform,
            status: status || 'online',
            location: location || existing.location,
            ipAddress: ipAddress || null,
            macAddress: macAddress || null,
            capabilities: capabilities ? JSON.stringify(capabilities) : existing.capabilities,
            configuration: configuration ? JSON.stringify(configuration) : existing.configuration,
            lastSeen: new Date(),
          },
        });
      } else {
        device = await db.device.create({
          data: {
            name, type, platform,
            status: status || 'online',
            location: location || 'Primary',
            ipAddress: ipAddress || null,
            macAddress: macAddress || null,
            entraOid: identity.oid,
            capabilities: capabilities ? JSON.stringify(capabilities) : null,
            configuration: configuration ? JSON.stringify(configuration) : null,
          },
        });
      }
      return res.json(device);
    } catch (err) {
      console.error('POST /api/devices error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/devices/:id — update status / heartbeat for a specific device
  app.patch('/api/devices/:id', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    try {
      const existing = await db.device.findFirst({ where: { id: req.params.id, entraOid: identity.oid } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const { status, lastHeartbeat } = req.body;
      const updated = await db.device.update({
        where: { id: req.params.id },
        data: {
          status: status || existing.status,
          lastSeen: new Date(),
          lastHeartbeat: lastHeartbeat ? new Date(lastHeartbeat) : new Date(),
        },
      });
      return res.json(updated);
    } catch (err) {
      console.error('PATCH /api/devices/:id error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/devices/:id — remove a device record
  app.delete('/api/devices/:id', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    try {
      const existing = await db.device.findFirst({ where: { id: req.params.id, entraOid: identity.oid } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      await db.device.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/devices/:id error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { createDeviceRoutes };
