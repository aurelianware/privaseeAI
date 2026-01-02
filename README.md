# privaseeAI

A sophisticated **web-based security monitoring application** that uses AI object detection to identify and track objects in real-time video streams. Built with React, TypeScript, and TensorFlow.js, featuring advanced overlay detection and cloud synchronization.

## 🌟 Key Features

### **🎯 Advanced Object Detection**
- **COCO-SSD Model**: State-of-the-art object detection using TensorFlow.js
- **Real-time Processing**: Live object identification in video streams  
- **Multiple Object Types**: Detects people, vehicles, animals, and everyday objects
- **Confidence Scoring**: Shows detection confidence percentages
- **Visual Overlays**: Color-coded bounding boxes with labels

### **📹 Enhanced Video Recording with Overlays**
- **Overlay Recording**: Videos include detection bounding boxes and labels
- **Smart Triggering**: Automatic recording when significant objects are detected
- **Multiple Formats**: Support for WebM and MP4 video formats
- **Canvas Stream Capture**: Records video + detection overlays simultaneously
- **Background Recording**: Non-blocking video capture

### **📸 Annotated Image Capture**
- **Detection Overlays**: Images include bounding boxes and labels
- **Position Data**: Exact pixel coordinates for each detection
- **Timestamp Information**: When each detection occurred
- **High Quality**: JPEG format with configurable quality

### **🎨 Advanced Visual Indicators**
- **Color-coded Bounding Boxes**: 
  - 🔴 Red: People (high priority alerts)
  - 🟠 Orange: Vehicles (medium priority) 
  - 🟢 Green: Other objects (low priority)
- **Detection Labels**: Object type and confidence percentage
- **Position Coordinates**: Exact location information
- **Alert Levels**: Visual priority indicators with corner markers

### **💾 Robust Storage & Sync System**
- **IndexedDB Storage**: Fast local data persistence with proper initialization
- **Blob Management**: Efficient image/video storage and retrieval
- **Azure Cloud Sync**: Background synchronization with queue management
- **Offline Support**: Full functionality without internet connection
- **Database Initialization**: Proper timing to prevent race conditions

### **⚙️ Comprehensive Settings**
- **Detection Thresholds**: Adjustable sensitivity controls
- **Recording Configuration**: Duration, format, and quality settings
- **Storage Management**: Automatic cleanup and retention policies
- **Cloud Integration**: Azure Blob Storage configuration
- **Performance Tuning**: Adaptive settings for different devices

## 🛠 Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **AI/ML**: TensorFlow.js with COCO-SSD model
- **Camera**: WebRTC Media APIs with canvas overlay system
- **Styling**: Tailwind CSS + Framer Motion
- **Storage**: IndexedDB with proper async initialization
- **Cloud**: Azure Blob Storage with SAS token authentication
- **PWA**: Workbox + Service Workers for offline functionality
- **Build**: Vite with TypeScript compilation
- **Deployment**: Vercel/Netlify ready, mobile PWA support

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run minimal drone MVP server (Prompt 28)
npm run mvp

# Build for production
npm run build

# Create desktop app (Electron)
npm run electron

# Create mobile app (Capacitor)
npm run mobile:build
```

## 🛠 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **ML**: TensorFlow.js + YOLO models
- **Camera**: WebRTC Media APIs
- **Styling**: Tailwind CSS + Framer Motion
- **Storage**: IndexedDB + Azure Blob Storage
- **Authentication**: NextAuth.js + OAuth providers
- **Database**: Prisma + SQLite/PostgreSQL
- **PWA**: Workbox + Service Workers
- **Desktop**: Electron (optional)
- **Mobile**: Capacitor (optional)

## 🛰️ Prompt 28 MVP (Drone Mission Skeleton)

Minimal Express server to run a canned mission against the Autel drone SDK.

1) Configure env: `DRONE_SSID`, `DRONE_PASSWORD`, optional `MVP_PORT` (defaults to 4001). See `.env.example`.
2) Run the server: `npm run mvp`.
3) Trigger a mission:

```bash
curl -X POST http://localhost:4001/api/mvp/mission \
  -H "Content-Type: application/json" \
  -d '{"missionName":"test","target":{"lat":37.7749,"lng":-122.4194,"alt":25}}'
```

Behavior: validates payload → connects to drone → preflight (battery >60%, GPS 3D lock with ≥8 satellites) → takeoff to starting altitude → flies simple 3-waypoint path (home → target hover 30s → home) at 6 m/s → return-to-home finish. Health check at `GET /api/mvp/health`.

## 🔐 Authentication Setup

This app includes OAuth authentication with Google and GitHub providers. To set up authentication for development:

### 1. Copy Environment Variables
```bash
cp .env.example .env.local
```

### 2. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client IDs**
5. Set the authorized redirect URI to: `http://localhost:3001/api/auth/callback/google`
6. Copy the Client ID and Client Secret to your `.env.local` file

### 3. GitHub OAuth Setup
1. Go to **GitHub Settings** > **Developer settings** > **OAuth Apps**
2. Click **New OAuth App**
3. Set Homepage URL to: `http://localhost:3001`
4. Set Authorization callback URL to: `http://localhost:3001/api/auth/callback/github`
5. Copy the Client ID and Client Secret to your `.env.local` file

### 4. Generate NextAuth Secret
```bash
openssl rand -base64 32
```
Add this to your `.env.local` file as `NEXTAUTH_SECRET`

### 5. Initialize Database
```bash
npx prisma generate
npx prisma db push
```

## 🧩 Environment Variables

Copy `.env.example` to `.env` (or `.env.local`) and fill in:

- NEXTAUTH_SECRET: random 32-byte string
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- GITHUB_ID / GITHUB_SECRET
- STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
- DRONE_SSID / DRONE_PASSWORD (Prompt 28 MVP server)
- MVP_PORT (optional, defaults to 4001)

## 📱 Deployment Options

1. **Web App**: Deploy to Vercel/Netlify
2. **Desktop App**: Package with Electron
3. **Mobile App**: Build with Capacitor
4. **Edge Deployment**: Use Edge Workers

This approach lets you:
- ✅ Develop everything in VS Code
- ✅ Use TensorFlow.js for ML
- ✅ Access device cameras
- ✅ Deploy to web, desktop, and mobile
- ✅ Integrate with Azure cloud services
- ✅ Learn modern web ML development

---

## 🚀 Production Readiness Checklist

PrivaseeAI is production-ready with enterprise-grade infrastructure and security.

### ✅ Docker & Containerization
- [x] **Multi-stage Dockerfile**: Optimized build with `node:20-bullseye` → `node:20-alpine`
- [x] **Production Dependencies**: Separate build and runtime dependencies
- [x] **Health Checks**: Built-in health monitoring at `/healthz` endpoint
- [x] **Small Image Size**: Alpine-based runtime for minimal footprint
- [x] **Security Scanning**: Container vulnerability scanning in CI/CD

### ✅ CI/CD Pipeline
- [x] **Build Workflow** (`build-and-push.yml`):
  - Automated builds on every commit
  - Pushes images to Azure Container Registry (ACR)
  - Uses Azure Managed Identity for authentication
  - Tags images with commit SHA and `latest`
  
- [x] **Deploy Workflow** (`deploy-aca.yml`):
  - Automated deployment to Azure Container Apps
  - Environment-based configuration
  - Automatic health checks post-deployment
  - Rollback capability with image tags

### ✅ Security Headers & HTTPS
- [x] **HSTS**: HTTP Strict Transport Security with 1-year max-age
- [x] **CSP**: Content Security Policy for XSS protection
- [x] **CORS**: Whitelist for `privaseeai.net` domain
- [x] **Referrer-Policy**: Strict origin control
- [x] **Permissions-Policy**: Camera/microphone access controls
- [x] **X-Frame-Options**: Clickjacking protection (DENY)
- [x] **X-Content-Type-Options**: MIME-sniffing prevention
- [x] **HTTPS Redirect**: Automatic redirect in production

### ✅ Database & Multi-Tenancy
- [x] **Prisma Schema**: PostgreSQL-ready production schema
- [x] **Multi-Tenant Models**:
  - `Tenant`: Organization-level isolation
  - `User`: Multi-tenant user management with roles
  - `Event`: Security events with tenant isolation
  - `Device`: Camera/device management
- [x] **Indexes**: Optimized queries for tenant/user/timestamp
- [x] **Migrations**: Database migration infrastructure ready
- [x] **Data Isolation**: Row-level tenant separation

### ✅ Azure Blob Lifecycle Management
- [x] **Automatic Deletion**: 30-day retention policy for old blobs
- [x] **Cost Optimization**: Auto-tier to Cool storage after 7 days
- [x] **Prefix Filters**: Applies to `events/`, `media/`, `recordings/`
- [x] **Infrastructure as Code**: `infra/blob-lifecycle.json` policy
- [x] **Easy Deployment**: Azure CLI command for policy application

### ✅ Monitoring & Observability
- [x] **Application Insights**: Optional Azure Monitor integration
- [x] **Health Endpoints**: `/healthz`, `/health`, `/api/health`
- [x] **Structured Logging**: Startup diagnostics and runtime logs
- [x] **Metrics**: Uptime, node version, directory structure
- [x] **Graceful Shutdown**: SIGTERM/SIGINT handling

### ✅ Environment Configuration
Required secrets for production deployment:
- `AZURE_CLIENT_ID`: Managed Identity client ID
- `AZURE_TENANT_ID`: Azure tenant ID
- `AZURE_SUBSCRIPTION_ID`: Azure subscription ID
- `ACR_NAME`: Azure Container Registry name
- `AZURE_RESOURCE_GROUP`: Resource group name
- `ACA_ENVIRONMENT`: Container Apps environment name
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: NextAuth.js secret key
- `AZURE_STORAGE_CONNECTION_STRING`: Blob storage connection

### 📋 Deployment Steps

#### 1. Initial Setup
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

#### 2. Apply Blob Lifecycle Policy
```bash
az storage account management-policy create \
  -g <resource-group> \
  -n <storage-account> \
  --policy @infra/blob-lifecycle.json
```

#### 3. Configure GitHub Secrets
Add all required secrets to your GitHub repository settings under Settings → Secrets and variables → Actions.

#### 4. Deploy
Push to `main` branch or manually trigger workflows:
```bash
git push origin main
```

The CI/CD pipeline will automatically:
1. Build and test the application
2. Build and push Docker image to ACR
3. Deploy to Azure Container Apps
4. Run health checks

### 🔒 Security Best Practices
- **No hardcoded secrets**: All sensitive data via environment variables
- **Managed Identity**: Azure authentication without credentials
- **SAS tokens**: Time-limited blob storage access
- **Rate limiting**: Protection against detection spam
- **Input validation**: Prisma schema validation
- **HTTPS only**: Production traffic encrypted in transit

### 📊 Performance & Scalability
- **Auto-scaling**: 1-3 replicas based on load
- **Resource limits**: 0.5 CPU, 1GB memory per container
- **CDN-ready**: Static assets served efficiently
- **Edge optimization**: TensorFlow.js runs in browser
- **Offline-first**: IndexedDB for local resilience

---
