# 🔧 Azure Storage Setup & Testing Guide

## 📋 Quick Azure Setup Checklist

### ✅ **Step 1: Create Storage Account**
- Account name: `{your-unique-name}securityapp`
- Type: **StorageV2 (general purpose v2)**
- Performance: **Standard**
- Replication: **LRS**
- Access tier: **Hot**

### ✅ **Step 2: Create Container**
- Container name: `security-events`
- Public access: **Private (no anonymous access)**

### ✅ **Step 3: Generate SAS Token**
```
Allowed services: ✅ Blob
Allowed resources: ✅ Container ✅ Object
Permissions: ✅ All (Read, Write, Delete, List, Add, Create, Update, Process)
Valid for: 1 year
```

## 🧪 **Testing Your Setup**

### **Phase 1: Local Testing** (Do This Now)
1. **Open**: http://localhost:3000
2. **Allow camera access**
3. **Point at objects** → Look for detection boxes
4. **Watch for**: "💾 X saved" indicator
5. **Open DevTools** (F12) → Console → Run:
   ```javascript
   // Check local storage
   await localStorageService.getEvents({ limit: 5 })
   
   // Check storage stats
   await syncQueueService.getStorageStats()
   ```

### **Phase 2: Cloud Sync Setup**
1. **Open Settings** in your app
2. **Enable "Cloud Sync"**
3. **Enter Azure credentials**:
   - Account Name: `yourstorageaccount`
   - Container Name: `security-events`
   - SAS Token: `sv=2022-11-02&ss=b&srt=sco&sp=rwdlacup&se=...`
4. **Click "Save & Test Configuration"**
5. **Should see**: ✅ "Cloud sync configured successfully!"

### **Phase 3: End-to-End Test**
1. **Trigger detections** → Watch "💾 saved" counter increase
2. **Click "Sync Now"** in settings
3. **Check Azure Portal** → Your container should have files:
   ```
   security-events/
   ├── events/
   │   └── evt_123_abc.json
   └── images/
       └── evt_123_abc.jpg
   ```

## 🔍 **Troubleshooting**

### **If local storage isn't working**:
```javascript
// Check if IndexedDB is working
console.log('IndexedDB supported:', 'indexedDB' in window)

// Check storage initialization
await localStorageService.initialize()
```

### **If cloud sync fails**:
- ✅ Check SAS token permissions
- ✅ Verify container name exact match
- ✅ Ensure token not expired
- ✅ Check browser console for errors

### **If YOLO detection isn't working**:
- ✅ Camera permissions granted
- ✅ Using HTTPS or localhost
- ✅ Check console for model loading errors

## 📱 **iPhone Deployment** (After local testing works)

### **Option 1: Simple HTTP** (Limited camera features)
- iPhone Safari → `http://192.168.50.133:3000`

### **Option 2: HTTPS** (Full features)
```bash
./deploy-mobile.sh
```
Then iPhone Safari → `https://192.168.50.133:3000`

## 🎯 **Success Indicators**

### **✅ Local Storage Working**:
- "💾 X saved" appears on camera feed
- Storage stats show events in Settings
- Browser DevTools → IndexedDB has data

### **✅ Cloud Sync Working**:
- "Sync Now" completes successfully
- Azure Portal shows uploaded files
- Settings show "0 unsynced events"

### **✅ Full System Working**:
- Detections trigger automatic saves
- Background sync uploads to cloud
- Offline → Online sync recovery works
- iPhone camera works with PWA features

## 🚀 **Ready to Test!**

**Current Status**: App running at http://localhost:3000
**Next Step**: Open in browser and test local storage first!