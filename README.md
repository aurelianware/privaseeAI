# PRIVASEE AI

## The Sentinel — AI-Powered Edge Security Monitoring Platform

![PRIVASEE AI](public/privaseeai-brand.png)

A cloud-native, privacy-first security monitoring SaaS platform. Real-time AI object detection runs in the browser via TensorFlow.js; events sync to per-user Azure Blob Storage; multi-tenant accounts are billed through Stripe. Built for edge deployment on any device with a camera — from laptops to RTSP IP cameras to the Autel EVO 640T thermal drone.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![React 19](https://img.shields.io/badge/React-19-61dafb)
![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178c6)
![Vite 7](https://img.shields.io/badge/Vite-7-646cff)
![Azure Container Apps](https://img.shields.io/badge/Azure-Container_Apps-0078d4)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-COCO--SSD%20%7C%20YOLOv8-ff6f00)
![Stripe Billing](https://img.shields.io/badge/Stripe-Billing-635bff)

---

## Architecture

```text
Browser (React 19 SPA)
  ├── TensorFlow.js inference (COCO-SSD or YOLOv8 — WebGL, in-browser)
  ├── Canvas overlay + WebM/MP4 annotated recording
  ├── IndexedDB — local-first event store
  ├── Azure Blob — cloud sync queue (user-scoped SAS tokens)
  ├── WebRTC — peer-to-peer multi-device calling
  └── Web Push — RFC 8030 notifications (PRO+)

Express Backend (Node.js 20)
  ├── MSAL v5 / Entra ID — RS256 JWT verification (JWKS-cached)
  ├── Stripe webhooks — FREE / PRO / ENTERPRISE subscription gating
  ├── Prisma 7 → Azure PostgreSQL — user settings, devices, events, system logs
  ├── ffmpeg — RTSP → HLS transcoding per camera
  ├── node-media-server — RTMP ingest (port 1935) for drone streams
  ├── WebSocket /ws/mission — telemetry relay (Android controller ↔ browser)
  └── WebSocket /ws/signal — WebRTC SDP/ICE signaling

Android Controller App (autel-controller/)          ← in active development
  ├── Autel MSDK — RGB + thermal camera (640×512 LWIR)
  ├── RootEncoder — MediaCodec → RTMP push → server:1935
  └── OkHttp WebSocket — telemetry up / commands down

Azure
  ├── Container Apps — 1–3 replicas, HTTPS ingress
  ├── Container Registry — Docker images (SHA-tagged)
  ├── PostgreSQL Flexible Server — multi-tenant DB
  └── Blob Storage — per-user containers (user-<oid>)
```

---

## Quick Start

### Docker / Azure Container Apps

```bash
git clone https://github.com/aurelianware/privaseeAI.git
cd privaseeAI
cp .env.example .env.local   # fill in required env vars (see below)
docker build -t privaseeai .
docker run -p 8080:8080 --env-file .env.local privaseeai
```

App: <http://localhost:8080>

### Local Development

```bash
# Prerequisites: Node.js 20+, PostgreSQL

git clone https://github.com/aurelianware/privaseeAI.git
cd privaseeAI
npm install
cp .env.example .env.local   # fill in env vars

# Sync database schema
npx prisma db push

# Start Vite dev server (port 3000, proxies /api → backend)
npm run dev

# In a second terminal — Express backend (port 3002)
npm start
```

---

## Features

### Real-Time AI Detection

| Feature | FREE | PRO | ENTERPRISE |
| ------- | :--: | :-: | :--------: |
| COCO-SSD detection (91 classes, WebGL) | ✓ | ✓ | ✓ |
| YOLOv8n detection (80 classes, higher accuracy) | — | ✓ | ✓ |
| Annotated canvas overlays (bounding boxes + confidence) | ✓ | ✓ | ✓ |
| WebM/MP4 recording with detections baked in | ✓ | ✓ | ✓ |
| Configurable confidence threshold | ✓ | ✓ | ✓ |

Detection runs entirely in the browser via TensorFlow.js (WebGL backend). No frames are uploaded for inference — privacy is preserved by design.

### Security Event Pipeline

- **Severity classification** — critical / high / medium / low with colour coding
- **IndexedDB local storage** — full offline capability; events survive page reloads
- **Azure Blob cloud sync** — priority-based upload queue, 3-retry exponential backoff, SAS auto-rotation
- **Event export** — CSV and JSONL download for SIEM integration (ENTERPRISE)
- **Motion webhook** — `POST /api/webhook/motion` accepts external alerts (e.g. from IP cameras with built-in motion detection)

### Multi-Camera Management

- **IP / RTSP cameras** — add by RTSP URL; server spawns ffmpeg, outputs HLS to `/streams/<id>/stream.m3u8`
- **RTSP URL validation** — blocks RFC-1918, loopback, and `169.254.x.x` cloud metadata IPs
- **HLS player** — `hls.js`-backed in-browser playback with auto-reconnect
- **Thermal cameras** — AGM Taipan V2 RTSP probe + Autel EVO 640T via Android MSDK (see Drone section)

### Drone Integration — Autel EVO 640T

> **Status:** Server infrastructure complete. Android controller app in active development.

The Autel EVO 640T's thermal camera (640×512 LWIR) requires the native Autel MSDK running on the Smart Controller Enterprise (Android). The platform is fully wired to receive drone data — you just need the Android app side:

**What's built (server-side):**

- RTMP ingest on port 1935 (`node-media-server`) — receives RGB and thermal H.264 streams
- Auto-transcodes RTMP → HLS using the same ffmpeg pipeline as IP cameras
- `/ws/mission` WebSocket relay — Android controller pushes telemetry up; browsers receive it
- REST commands (`/api/drone/pause`, `/api/drone/return-home`, `/api/drone/emergency-land`) broadcast to Android app via WebSocket
- `GET /api/drone/controller-key` — key distribution endpoint (PRO+)
- `MissionDashboard.tsx` — live HLS video players + telemetry display (ready for real data)

**Android controller app (`autel-controller/`):**

- Project scaffolded: Kotlin, ViewBinding, OkHttp WebSocket, RootEncoder RTMP library
- Connects to server over internet; streams RGB + thermal via RTMP; relays telemetry
- Requires Autel MSDK AAR (download from [developer.autelrobotics.com](https://developer.autelrobotics.com))
- See [docs/DRONE_SETUP.md](docs/DRONE_SETUP.md) for setup steps

### SaaS Billing — Stripe

Three subscription tiers with Stripe Checkout, webhook lifecycle management, and server-side enforcement:

| Tier | Price | Limits | Features |
| ---- | ----- | ------ | -------- |
| **FREE** | $0 | 2 devices, 100 MB storage | COCO-SSD, local-only sync |
| **PRO** | $9.99/mo | 10 devices, cloud sync | YOLOv8, Azure Blob, push notifications, WebRTC |
| **ENTERPRISE** | $29.99/mo | Unlimited | Everything + managed containers, audit log export, drone missions |

Webhooks handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Managed Azure Blob container provisioned automatically on first PRO+ login.

### Authentication & Security

- **MSAL v5** (`@azure/msal-browser`) — Microsoft Entra ID primary identity provider; multi-tenant (work/school/personal MSA)
- **JWT verification** — RS256 signature validated against Entra JWKS endpoint; `aud` + `exp` enforced on every request
- **Fail-closed authorization** — `requirePro` / `requireEnterprise` return 503 on DB error (never fail-open)
- **AES-256-GCM encryption** — SAS tokens stored encrypted server-side; client never sees plaintext
- **RTSP SSRF prevention** — URL validation blocks private IPs and cloud metadata endpoints before ffmpeg spawn
- **CSP header** — `frame-ancestors 'none'` prevents clickjacking
- **HAR files** — removed from repo; `*.har` in `.gitignore`

### Real-Time Communication

- **WebRTC P2P** — multi-device calling via `CallPanel.tsx`; SDP/ICE signaling over `/ws/signal`
- **Web Push (RFC 8030)** — `web-push` VAPID notifications for motion alerts (PRO+); no Azure Notification Hubs dependency
- **WebSocket /ws/mission** — bidirectional relay for drone telemetry and mission events

### Device Management

- **Device registry** — server-persisted; devices survive page reloads across sessions
- **Device limit enforcement** — per-tier limits checked on registration (FREE: 2, PRO: 10, ENTERPRISE: unlimited)
- **Multi-device dashboard** — view and manage all registered devices; online/offline status

---

## Technology Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend framework | React 19 + TypeScript 5 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 + Sentinel design tokens |
| AI inference | TensorFlow.js 4 · COCO-SSD (FREE) · YOLOv8n (PRO+) |
| Authentication | MSAL v5 (Microsoft Entra ID) |
| JWT verification | `jsonwebtoken` + `jwks-rsa` (RS256, JWKS-cached) |
| Backend | Node.js 20 · Express 5 |
| Database ORM | Prisma 7 (`@prisma/adapter-pg`) |
| Database | Azure Database for PostgreSQL (Flexible Server) |
| Media storage | Azure Blob Storage (managed per-user containers + BYOS) |
| Video streaming | ffmpeg (RTSP→HLS) · node-media-server (RTMP ingest) |
| Real-time | WebSocket (`ws`) · WebRTC signaling |
| Push notifications | `web-push` RFC 8030 (VAPID) |
| Billing | Stripe (Checkout · webhooks · subscription lifecycle) |
| Containerisation | Docker multi-stage (node:20-alpine runtime) |
| Deployment | Azure Container Apps · GitHub Actions CI/CD |
| Container registry | Azure Container Registry (SHA-tagged images) |
| Android app | Kotlin · Autel MSDK · RootEncoder · OkHttp |

---

## Project Structure

```text
privaseeAI/
├── src/
│   ├── App.tsx                        # Root component — Sentinel UI shell
│   ├── components/
│   │   ├── CameraStream.tsx           # WebRTC camera + TensorFlow inference loop
│   │   ├── EventsList.tsx             # Security event feed with media playback
│   │   ├── SettingsPanel.tsx          # User settings + storage config
│   │   ├── HlsVideoPlayer.tsx         # IP camera + drone HLS stream player
│   │   ├── MissionDashboard.tsx       # Drone mission control + telemetry UI
│   │   ├── MissionLauncher.tsx        # Mission planning + launch interface
│   │   ├── MultiDeviceDashboard.tsx   # Fleet device management
│   │   ├── CallPanel.tsx              # WebRTC peer-to-peer calling
│   │   ├── OnboardingWizard.tsx       # First-run setup flow
│   │   ├── PricingModal.tsx           # Stripe upgrade UI
│   │   ├── ErrorBoundary.tsx          # React crash boundary (outermost)
│   │   └── Auth.tsx / AuthProvider.tsx
│   ├── services/
│   │   ├── AutelDroneSDK.ts           # Autel drone interface (stubs → MSDK)
│   │   └── FlightOrchestrator.ts      # Autonomous mission execution engine
│   ├── hooks/
│   │   ├── useUserSettings.ts         # Server-synced encrypted settings
│   │   └── useWebRTC.ts               # WebRTC session management
│   ├── drone/                         # Autel SDK adapter types
│   └── utils/
│       ├── storage.ts                 # IndexedDB local event store
│       ├── syncQueue.ts               # Azure Blob upload queue
│       ├── yolo.ts                    # YOLOv8 model loader + inference
│       ├── deviceRegistry.ts          # Device persistence (local + server)
│       └── pushNotifications.ts       # VAPID Web Push
├── autel-controller/                  # Android companion app (Kotlin)
│   ├── app/src/main/java/com/privaseeai/controller/
│   │   ├── MainActivity.kt            # Settings UI + connect button
│   │   ├── DroneService.kt            # Foreground service — MSDK bridge
│   │   ├── MsdkManager.kt             # Autel MSDK init + callbacks
│   │   ├── RtmpPublisher.kt           # MediaCodec → RTMP (RGB + thermal)
│   │   └── TelemetryBridge.kt         # OkHttp WS — telemetry up, commands down
│   └── app/build.gradle.kts
├── prisma/
│   └── schema.prisma                  # 10 models: User, Device, Event, UserSettings, …
├── server.js                          # Express backend (56 endpoints + WebSocket)
├── Dockerfile                         # Multi-stage production build
├── .github/workflows/
│   ├── build-and-push.yml             # Build + push image to ACR
│   └── deploy-aca.yml                 # Deploy to Azure Container Apps
├── src/test/
│   └── security.test.ts               # 22 security tests (RTSP, JWT, fail-closed auth)
├── docs/
│   ├── DEPLOYMENT_GUIDE.md
│   ├── DRONE_SETUP.md
│   ├── STRIPE_SETUP.md
│   └── SECURITY.md
└── infra/
    └── blob-lifecycle.json            # Blob storage lifecycle policy
```

---

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `SETTINGS_ENCRYPTION_KEY` | ✓ | 32-byte hex AES key (`openssl rand -hex 32`) |
| `STRIPE_SECRET_KEY` | ✓ | Stripe API secret (`sk_live_…`) |
| `STRIPE_PRO_PRICE_ID` | ✓ | Stripe PRO price ID |
| `STRIPE_ENTERPRISE_PRICE_ID` | ✓ | Stripe ENTERPRISE price ID |
| `STRIPE_WEBHOOK_SECRET` | ✓ | Stripe webhook signing secret |
| `AZURE_STORAGE_ACCOUNT` | ✓ | Blob storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | ✓ | Blob storage account key |
| `AZURE_ADMIN_SAS` | ✓ | Admin SAS for user container provisioning |
| `VITE_ENTRA_CLIENT_ID` | ✓ | Entra app registration client ID (baked into Docker image) |
| `ENTRA_CLIENT_ID` | recommended | JWT `aud` claim validation (same value as above) |
| `VAPID_PUBLIC_KEY` | push | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | push | Web Push VAPID private key |
| `VITE_VAPID_PUBLIC_KEY` | push | Frontend VAPID key (baked into image) |
| `DRONE_CONTROLLER_KEY` | drone | Shared secret for Android controller (`openssl rand -hex 32`) |
| `MOTION_WEBHOOK_KEYS` | optional | CSV API keys for `/api/webhook/motion` |

Server validates presence of critical variables at startup and logs warnings for any that are missing.

---

## CI/CD

Push to `main` triggers a two-stage GitHub Actions pipeline:

1. **`build-and-push.yml`** — lints, tests, builds Vite bundle, builds Docker image, pushes to ACR tagged with `$GITHUB_SHA`
2. **`deploy-aca.yml`** — updates the Azure Container App with the new image; creates the app if it doesn't exist; health-checks `/healthz` after deploy

ACR image push is skipped on pull requests (Azure federated identity is branch-push scoped).

Required GitHub Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `ACR_NAME`, `ACA_ENVIRONMENT`, plus all runtime env vars above.

See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for full setup.

---

## Roadmap

### Platform

- [x] Real-time COCO-SSD detection with canvas overlay recording
- [x] YOLOv8n detection for PRO+ tier (browser-based, higher accuracy)
- [x] Azure Blob Storage cloud sync — managed containers (PRO+) and BYOS
- [x] Multi-tenant AES-256-GCM encrypted user settings
- [x] Azure PostgreSQL backend with Prisma 7
- [x] MSAL v5 Microsoft Entra ID authentication + RS256 JWT verification
- [x] Fail-closed authorization (no fail-open on DB errors)
- [x] RTSP SSRF prevention (private IP + cloud metadata blocking)
- [x] Stripe billing — FREE / PRO / ENTERPRISE with webhooks
- [x] Device registry with server persistence + tier-based device limits
- [x] IP / RTSP multi-camera management with ffmpeg HLS transcoding
- [x] WebRTC peer-to-peer multi-device calling
- [x] Web Push notifications RFC 8030 (PRO+)
- [x] Audit log export — CSV and JSONL (ENTERPRISE)
- [x] Motion webhook integration (`POST /api/webhook/motion`)
- [x] Docker + Azure Container Apps CI/CD pipeline
- [x] React ErrorBoundary (full app crash recovery)
- [x] Sentinel brand redesign (dark glass-morphism aesthetic)
- [x] Animated logo video integration

### Drone (Autel EVO 640T)

- [x] RTMP ingest server — node-media-server on port 1935
- [x] /ws/mission bidirectional relay — Android controller ↔ browser
- [x] Browser command relay — pause / RTH / emergency land → Android app
- [x] MissionDashboard UI — HLS video players + telemetry display
- [x] Android controller app scaffold — Kotlin, RTMP publisher, WebSocket bridge
- [ ] Autel MSDK integration — requires MSDK AAR from developer.autelrobotics.com
- [ ] Autonomous waypoint missions (FlightOrchestrator full implementation)
- [ ] Thermal overlay analysis (640×512 LWIR annotation)

### Planned

- [ ] Auth0 support for non-Microsoft identity providers
- [ ] Redis-backed distributed rate limiting (multi-replica deployments)
- [ ] Mobile native app (Capacitor / iOS)
- [ ] Azure Application Insights telemetry
- [ ] Server-side ONNX inference (optional alternative to browser TensorFlow.js)

---

## Related Projects

- **[Cloud Dental Office](https://github.com/aurelianware/clouddentaloffice)** — SaaS dental practice management with integrated privaseeAI vision service for narcotics cabinet monitoring, consent recording, and insurance card OCR

---

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Aurelianware
