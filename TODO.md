# PRIVASEE AI — Launch TODO

Tracks remaining work toward a launchable SaaS product with paid tiers.
Work items are grouped by priority. Pick up any session by starting at the top of **Critical**.

---

## Critical (must fix before charging users)

- [x] **Wire Stripe price IDs** — Products created in Stripe Dashboard (test mode).
  Price IDs confirmed active:
  - `STRIPE_PRO_PRICE_ID=price_1T3DcSJu0wSGGF9nYTG57VUN` ($9.99/mo)
  - `STRIPE_ENTERPRISE_PRICE_ID=price_1T3DfYJu0wSGGF9nfj526WUc` ($29.99/mo)
  Both set in `.env.local`. Frontend uses server-side redirect checkout — no publishable key needed.

- [x] **Fix `logEventToDb` stub** — `server.js:758` was `console.log` only.
  Now writes to a daily-rotating JSONL file under `logs/events-YYYY-MM-DD.jsonl`.
  Full DB persistence of webhook motion events requires schema work (see High Priority below).

- [x] **End-to-end Stripe billing test** — Completed. PRO and ENTERPRISE checkouts verified.
  All webhooks return 200. `userSettings.subscriptionTier` updated correctly in DB.
  Two bugs found and fixed during testing:
  1. `create-checkout-session`: DB lookup was inside the Stripe try/catch — a DB timeout blocked checkout entirely. Fixed by isolating the DB call in its own try/catch.
  2. `server.js:13`: `const fetch = require('node-fetch')` shadowed the native global `fetch` with a non-callable object (node-fetch v3 ESM/CJS interop). Removed the import; native fetch used throughout.
  Azure PostgreSQL firewall rule added for dev IP (74.244.177.89).

- [x] **Add startup env validation** — `checkEnv()` in `server.js` runs at startup, checks 9 required vars
  (DATABASE_URL, Stripe keys/price IDs, SETTINGS_ENCRYPTION_KEY, Azure storage vars) and logs a clear
  bullet table with per-var impact descriptions. Silent on clean config; noisy on misconfiguration.

---

## High Priority (degrades paid value without)

- [x] **Persist motion webhook events to DB** — Added `SystemLog` Prisma model (id, type, message, data JSON,
  correlationId, createdAt). `logEventToDb` now writes non-blocking to `SystemLog` in addition to JSONL files.
  Opted for SystemLog over modifying `Event` (which requires tenantId/userId) — keeps webhook path simple.
  Schema applied via `prisma db push`. Verified insert in production DB.

- [x] **Fix syncQueue status display** — Implemented counters in `SyncQueueService`:
  `lastSyncTime`, `sessionTotalSynced`, `lastKnownPending`, `recentErrors` (last 5).
  All four fields now populated during `processSyncQueue()` and returned from `getSyncStatus()`.
  `SettingsPanel.tsx` renders a status line below the sync buttons: "Last synced: X min ago · N uploaded · N pending"
  plus a red error badge with tooltip when sync failures occur.

- [x] **Wire YOLO v8 into detection pipeline** — `src/utils/yolo.ts` fully rewritten with dual-backend
  `YOLOModel` class. `loadModel(useYoloV8)` tries `tf.loadGraphModel` from Azure Blob first, falls back
  to COCO-SSD on failure. Full YOLOv8n inference: 640×640 resize → normalize → [1,84,8400] parse → NMS.
  `CameraStream.tsx` gates `useYoloV8 = tier === 'PRO' || 'ENTERPRISE'`; badge shows "YOLOv8 PRO" (purple)
  or "COCO-SSD" (blue). `App.tsx` merges `subscriptionTier` from server settings and passes it as prop.
  One-time ops step still required: upload `yolov8n_web_model/` to Azure Blob (see yolo.ts header comments).

- [x] **Real `logEventToDb` notifications via DB** — Resolved by SystemLog implementation above.

---

## Medium Priority (polish before growth)

- [ ] **Onboarding flow** — First-time login drops users into the full dashboard with no guidance.
  Add a simple 3-step wizard: (1) choose plan → (2) connect first camera → (3) configure Azure Blob (PRO).

- [ ] **Push notifications** — Azure Notification Hubs integration not started.
  Alert users on mobile when a high-severity detection event fires. Required for PRO value prop.
  Reference: [Azure Notification Hubs docs](https://learn.microsoft.com/en-us/azure/notification-hubs/)

- [ ] **Drone orchestration completion** — `FlightOrchestrator.ts` `generateMission()` and `executeMission()` are stubs.
  `src/routes/webhookRoutes.ts:14` blocks: `"drone launch disabled (not implemented)"`.
  Steps: implement waypoint generation from GPS coords, call `AutelDroneSDK` execute methods.
  Gate feature behind ENTERPRISE tier. Can ship as "coming soon" label in the meantime.

- [ ] **`logEventToDb` in server.js:759** — Replace remaining `TODO: replace with real DB insert` comment
  (already patched in this pass) with the `SystemLog` model approach once that model is added.

---

## Lower Priority (post-launch)

- [ ] **Android controller app for Autel EVO 640T Enterprise** — Native Kotlin app installed on the Smart Controller Enterprise (Android-based) to replace the current WebSocket relay stub with real Autel MSDK integration. The 640T's thermal camera (640px LWIR) is only accessible via the MSDK; the current TCP/WebSocket approach cannot surface thermal data at all.
  Responsibilities:
  1. Connect to the 640T via Autel MSDK (Java/Kotlin) — replaces placeholder methods in `src/drone/control/`
  2. Stream RGB + thermal frames upstream to `server.js` via WebSocket (MJPEG or WebRTC)
  3. Forward real-time telemetry to fill in the `DroneTelemetry` types currently populated with stubs
  4. Accept mission commands from `MissionDashboard.tsx` to unblock `FlightOrchestrator` stubs
  5. Optional: run TFLite person-detection on thermal frames on-device before relay
  Gate full thermal features behind ENTERPRISE tier. Capacitor is not suitable here — native Android is required for deep MSDK access.

- [ ] **Mobile apps** — Capacitor config exists but iOS/Android apps not built. Target after web SaaS is stable.

- [ ] **SIEM / audit log export** — No export functionality. Enterprise customers will want SIEM-compatible
  (CEF/Syslog) or CSV export of the `Event` table. Add `/api/events/export` endpoint gated behind ENTERPRISE.

- [ ] **YOLO v8 server-side inference** — Current browser-based TensorFlow.js runs on client GPU.
  For headless / embedded deployments, add optional server-side YOLO via ONNX Runtime Node.js bindings.

- [ ] **`FlightLogger` full implementation** — `src/drone/logger/FlightLogger.ts` has placeholder file logging
  and archiving methods. Low impact until drone missions are live.

- [ ] **`ErrorHandler` retry logic** — `src/drone/recovery/ErrorHandler.ts` has placeholder retry logic.
  Required for reliable autonomous drone missions but not blocking SaaS launch.

---

## Done ✓

- [x] Stripe billing: FREE / PRO / ENTERPRISE tiers with checkout, webhooks, customer portal
- [x] `requirePro` middleware gating cloud endpoints
- [x] Azure AD (MSAL v5) multi-tenant auth
- [x] PostgreSQL + Prisma schema with `UserSettings`, `Event`, `Tenant`, `User`, `Device`
- [x] Real-time COCO-SSD AI detection with canvas overlay
- [x] Azure Blob Storage cloud sync with SAS token auth
- [x] RTSP → HLS multi-camera management via ffmpeg
- [x] Docker multi-stage build + GitHub Actions CI/CD to Azure Container Apps
- [x] WebRTC peer-to-peer multi-user calling
- [x] AES-256-GCM encrypted settings per user
- [x] `logEventToDb` file-based JSONL persistence (replaces console.log stub)
