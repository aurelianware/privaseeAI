# PRIVASEE AI — Launch TODO

Tracks remaining work toward a launchable SaaS product with paid tiers.
Work items are grouped by priority. Pick up any session by starting at the top of **Critical**.

---

## Critical (must fix before charging users)

- [ ] **Wire Stripe price IDs** — Create products in [Stripe Dashboard](https://dashboard.stripe.com/products), then add the
  price IDs to `.env.local`:
  ```
  STRIPE_PRO_PRICE_ID=price_...
  STRIPE_ENTERPRISE_PRICE_ID=price_...
  ```
  Without these, `POST /api/stripe/create-checkout-session` returns a broken checkout URL.
  See [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) for full walkthrough.

- [x] **Fix `logEventToDb` stub** — `server.js:758` was `console.log` only.
  Now writes to a daily-rotating JSONL file under `logs/events-YYYY-MM-DD.jsonl`.
  Full DB persistence of webhook motion events requires schema work (see High Priority below).

- [ ] **End-to-end Stripe billing test** — Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  and walk through: FREE → PRO checkout → webhook → `userSettings.subscriptionTier` updated → `requirePro`
  middleware allows access. Cover these event types:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

- [ ] **Add startup env validation** — Server silently degrades when secrets are missing (Stripe, DB, encryption key).
  Add a startup check that logs a clear error table of missing required vars so misconfiguration is obvious in prod logs.

---

## High Priority (degrades paid value without)

- [ ] **Persist motion webhook events to DB** — `logEventToDb` now writes to JSONL files but not the `Event` table.
  The `Event` model requires `tenantId` and `userId` (non-nullable), which aren't available in the API-key-authenticated
  webhook path. Options:
  1. Add an optional `apiKeyId` / `sourceTag` field and allow null tenantId/userId for system-originated events (requires migration).
  2. Require webhook callers to pass an `x-tenant-id` header, validate it against `Tenant` table, then associate.
  Recommendation: Option 2 — add `x-tenant-id` header to webhook auth + store against that tenant.

- [ ] **Fix syncQueue status display** — `src/utils/syncQueue.ts:352-355` has TODOs for tracking sync time,
  pending item count, and error counts. PRO users see no feedback on whether cloud sync is working.
  Implement the counters and expose them via a `/api/sync/status` endpoint.

- [ ] **Wire YOLO v8 into detection pipeline** — `src/utils/yolo.ts` is a stub. YOLO v8 was intended as the
  higher-accuracy PRO-tier detection upgrade over COCO-SSD. Steps:
  1. Finish the YOLO v8 ONNX/TFLite loader in `yolo.ts`
  2. Add a feature-gated toggle in `CameraStream.tsx` (PRO+ only)
  3. Document model download / hosting in Azure Blob

- [ ] **Real `logEventToDb` notifications via DB** — `notifyUser()` and `persistLog()` both call `logEventToDb`.
  These drone/system events are now file-logged. Consider adding a lightweight `SystemLog` Prisma model
  (id, type, message, data JSON, createdAt) so ops events are queryable without digging through JSONL files.

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
