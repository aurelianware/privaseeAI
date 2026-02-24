// ─── User Settings API (multi-tenant, per-user persisted credentials) ─────────
const { verifyEntraTokenAsync }                           = require('../auth');
const { getPrisma }                                       = require('../db');
const { decryptValue, encryptValue }                      = require('../encryption');
const { provisionUserContainer, generateContainerSas }    = require('../storage');

function createUserSettingsRoutes(app) {
  // GET /api/user/settings — load settings for the authenticated user
  app.get('/api/user/settings', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
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
    const identity = await verifyEntraTokenAsync(req);
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
}

module.exports = { createUserSettingsRoutes };
