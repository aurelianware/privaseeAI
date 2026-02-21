# YOLO Models Guide & iPhone Deployment

## 🎯 YOLO Model Options

### 1. YOLOv5 Models (Ultralytics)
- **YOLOv5n** (Nano): 1.9MB - Ultra-fast, good for real-time mobile
- **YOLOv5s** (Small): 14MB - Best balance for web deployment
- **YOLOv5m** (Medium): 42MB - Higher accuracy, slower
- **YOLOv5l** (Large): 90MB - Highest accuracy, desktop only

### 2. YOLOv8 Models (Latest)
- **YOLOv8n**: 6MB - Improved architecture, mobile-friendly
- **YOLOv8s**: 22MB - Enhanced detection accuracy
- **YOLOv8m**: 52MB - Professional-grade detection

### 3. Specialized Models
- **YOLO-Face**: Optimized for face detection
- **YOLO-World**: Open vocabulary detection
- **RT-DETR**: Real-time detection transformer

## 📱 iPhone Deployment Guide

### Method 1: Progressive Web App (PWA) - Recommended for Testing

#### Step 1: Build for Production
```bash
cd WebSecurityApp
npm run build
```

#### Step 2: Serve Locally for iPhone Testing
```bash
# Install a simple HTTPS server
npm install -g http-server

# Serve with HTTPS (required for camera access)
http-server build -p 3000 -S -C cert.pem -K key.pem
```

#### Step 3: Generate SSL Certificate for Local Testing
```bash
# Install mkcert for local SSL certificates
brew install mkcert
mkcert -install

# Generate certificate for your local IP
mkcert localhost 192.168.1.XXX  # Replace with your computer's IP

# Start server with SSL
http-server build -p 3000 -S -C localhost+1.pem -K localhost+1-key.pem
```

#### Step 4: Access on iPhone
1. Find your computer's IP address: `ifconfig | grep inet`
2. On iPhone Safari: `https://192.168.1.XXX:3000`
3. Accept the security warning
4. Add to Home Screen for PWA experience

### Method 2: Deploy to Vercel/Netlify (Production)

#### Vercel Deployment:
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### Netlify Deployment:
```bash
# Build
npm run build

# Drag and drop 'build' folder to netlify.com
# Or use Netlify CLI
npm i -g netlify-cli
netlify deploy --prod --dir=build
```

## 🚀 YOLO Model Setup

### Option 1: Use Pre-hosted Models (Easiest)
```typescript
// In your React component
const modelUrls = {
  'yolov5s': 'https://tfhub.dev/tensorflow/tfjs-model/yolov5/1/default/1',
  'yolov8n': 'https://storage.googleapis.com/tfjs-models/tfjs/yolov8n_web_model/model.json',
  'mobile': 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json'
};
```

### Option 2: Host Models Locally (Better Performance)

#### Download YOLOv5 Web Model:
```bash
# Create models directory
mkdir -p public/models

# Download YOLOv5s web model (14MB)
cd public/models
curl -L -o yolov5s.zip "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s_web_model.zip"
unzip yolov5s.zip
mv yolov5s_web_model yolov5s

# Your structure should be:
# public/models/yolov5s/model.json
# public/models/yolov5s/weights.bin
```

#### Update Model Loading:
```typescript
// Use local model
await yoloModel.loadModel('/models/yolov5s/model.json');
```

### Option 3: Convert Custom Models

#### Convert PyTorch YOLO to TensorFlow.js:
```bash
# Install YOLOv5
git clone https://github.com/ultralytics/yolov5
cd yolov5
pip install -r requirements.txt

# Export to TensorFlow.js format
python export.py --weights yolov5s.pt --include tfjs --img-size 640
```

## 📱 iPhone-Specific Optimizations

### 1. Camera Configuration for iPhone
```typescript
const constraints = {
  video: {
    facingMode: { ideal: 'environment' }, // Back camera
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
    aspectRatio: { ideal: 16/9 }
  }
};
```

### 2. Performance Optimizations
```typescript
// Reduce detection frequency on mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const detectionInterval = isMobile ? 200 : 100; // ms between detections

// Use smaller model on mobile
const modelSize = isMobile ? 'yolov5n' : 'yolov5s';
```

### 3. Memory Management
```typescript
// Dispose tensors promptly
tf.tidy(() => {
  const prediction = model.predict(input);
  return postProcess(prediction);
});

// Monitor memory usage
console.log('Memory usage:', tf.memory());
```

## 🔧 LiDAR Integration (Future Enhancement)

For native iOS LiDAR integration, you'd need:

### Swift/iOS Implementation:
```swift
import ARKit
import RealityKit

class LiDARManager: ObservableObject {
    private var arView: ARView!
    
    func startLiDARSession() {
        let configuration = ARWorldTrackingConfiguration()
        configuration.sceneReconstruction = .mesh
        arView.session.run(configuration)
    }
    
    func getDepthData() -> ARFrame.DepthData? {
        return arView.session.currentFrame?.sceneDepth
    }
}
```

### Web-based Depth Estimation (Alternative):
```typescript
// Use MediaPipe or TensorFlow.js depth estimation
import '@tensorflow/tfjs-backend-webgl';

const depthModel = await tf.loadLayersModel('/models/depth_estimation/model.json');

function estimateDepth(imageElement: HTMLImageElement) {
  const input = tf.browser.fromPixels(imageElement)
    .resizeNearestNeighbor([256, 256])
    .expandDims(0)
    .div(255.0);
    
  const depthMap = depthModel.predict(input) as tf.Tensor;
  return depthMap;
}
```

## 🐛 Debugging Tips

### 1. iPhone Safari Debugging
- Enable Safari Developer menu: Settings > Safari > Advanced > Web Inspector
- Connect iPhone to Mac, open Safari, Develop menu > iPhone > your page

### 2. Check Camera Permissions
```typescript
navigator.permissions.query({ name: 'camera' as PermissionName })
  .then(result => console.log('Camera permission:', result.state));
```

### 3. Monitor Performance
```typescript
// Add performance monitoring
const startTime = performance.now();
const detections = await yoloModel.detect(video);
const endTime = performance.now();
console.log(`Detection took ${endTime - startTime}ms`);
```

### 4. Error Handling
```typescript
try {
  const detections = await yoloModel.detect(video);
} catch (error) {
  console.error('Detection failed:', error);
  // Fallback to simpler model or disable detection
}
```

## 📊 Performance Expectations

### iPhone Performance:
- **iPhone 12+**: YOLOv5s at 15-20 FPS
- **iPhone 11**: YOLOv5n at 10-15 FPS  
- **Older iPhones**: Consider fallback models

### Model Size vs Speed:
- YOLOv5n: 1.9MB, ~50ms inference
- YOLOv5s: 14MB, ~80ms inference
- YOLOv8n: 6MB, ~60ms inference

## 🎯 Next Steps

1. **Test locally**: Start with localhost deployment
2. **Optimize model**: Choose appropriate model size for target devices
3. **Deploy remotely**: Use Vercel/Netlify for public access
4. **Add PWA features**: Install prompt, offline capability
5. **Enhanced detection**: Custom training for specific use cases

## 📝 Notes

- Always use HTTPS for camera access on iPhone
- Test on actual devices - performance varies significantly
- Consider model quantization for better mobile performance
- Monitor memory usage - dispose tensors properly
- Implement graceful fallbacks for unsupported devices