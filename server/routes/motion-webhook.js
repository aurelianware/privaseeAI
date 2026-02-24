// ─── Motion webhook endpoint ──────────────────────────────────────────────────
const { randomUUID } = require('crypto');
const { checkRateLimit, enqueueEvent, getApiKeys, validatePayload } = require('../middleware');
const { logEventToDb } = require('../event-log');

function acceptedStatus(queued) {
  return queued ? 202 : 200;
}

/**
 * @param {import('express').Application} app
 * @param {{ triggerDroneLaunch: Function, sendPushToAllSubscribed: Function }} deps
 */
function createMotionWebhookRoutes(app, { triggerDroneLaunch, sendPushToAllSubscribed }) {
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
        // Push alert to all subscribed users
        const loc = req.body.location
          ? `${req.body.location.lat?.toFixed(4)}, ${req.body.location.lng?.toFixed(4)}`
          : req.body.camera_id || 'unknown location';
        sendPushToAllSubscribed({
          title: `⚠️ Security Alert`,
          body: `Threat level ${req.body.threat_level} detected at ${loc}`,
          icon: '/pwa-192x192.png',
          url: '/',
        }).catch(() => {});
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
}

module.exports = { createMotionWebhookRoutes };
