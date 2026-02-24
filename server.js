require('ts-node/register/transpile-only');
// Load .env.local in development (Vite handles this for the frontend automatically)
require('dotenv').config({ path: '.env.local' });

// ─── Module imports (topological order — no cycles) ───────────────────────────
const { checkEnv }               = require('./server/startup');
const { registerMiddleware }     = require('./server/middleware');
const { setupWebSocket }         = require('./server/drone-ws');
const { setupSignalingWebSocket }= require('./server/signal-ws');
const { setupMissionWebSocket,
        sendCommandToController,
        broadcastMission }       = require('./server/mission-ws');
const { createNms }              = require('./server/rtmp');
const { startStream, stopStream,
        createStreamRoutes }     = require('./server/streams');
const { orchestrator,
        ensureDroneReady,
        createDroneRoutes }      = require('./server/drone');
const { sendPushToAllSubscribed }= require('./server/notifications');

// Route factories
const { createStripeWebhookRoutes } = require('./server/routes/stripe-webhook');
const { createSignalRoutes }        = require('./server/routes/signal');
const { createHealthRoutes }        = require('./server/routes/health');
const { createUserSettingsRoutes }  = require('./server/routes/user-settings');
const { createPushRoutes }          = require('./server/routes/push');
const { createMotionWebhookRoutes } = require('./server/routes/motion-webhook');
const { createDeviceRoutes }        = require('./server/routes/devices');
const { createAuditRoutes }         = require('./server/routes/audit');
const { createBillingRoutes }       = require('./server/routes/billing');
const { createStaticRoutes }        = require('./server/routes/static');

checkEnv();

const express = require('express');
const app  = express();
const port = process.env.PORT || 3000;

// ─── Route registration order matters ─────────────────────────────────────────

// 1. Stripe webhook MUST be registered before express.json() (requires raw body)
createStripeWebhookRoutes(app);

// 2. express.json() + security headers (all other routes need this)
registerMiddleware(app);

// 3. All routes
createSignalRoutes(app);
createHealthRoutes(app);
createStreamRoutes(app);   // /api/streams, /api/thermal/*, /streams static serve
createDroneRoutes(app, { sendCommandToController });

// triggerDroneLaunch is a closure here to avoid motion-webhook → drone → mission-ws cycle
createMotionWebhookRoutes(app, {
  triggerDroneLaunch: async (event, correlationId) => {
    await ensureDroneReady();
    await orchestrator.handleThreat({
      id: correlationId,
      location: { latitude: event.location.lat, longitude: event.location.lng },
      snapshotUrl: event.snapshot_url,
      threatLevel: event.threat_level,
    });
  },
  sendPushToAllSubscribed,
});

createUserSettingsRoutes(app);
createPushRoutes(app);
createDeviceRoutes(app);
createAuditRoutes(app);
createBillingRoutes(app);
createStaticRoutes(app);   // MUST be last — SPA fallback catches all unmatched paths

// ─── HTTP server + WebSockets + RTMP ─────────────────────────────────────────
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

setupWebSocket(server);
setupSignalingWebSocket(server);
setupMissionWebSocket(server);

const nms = createNms({ startStream, stopStream, broadcastMission });
nms.run();
console.log('[RTMP] Ingest listening on port 1935');
