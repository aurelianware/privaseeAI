import { useState, useCallback, useEffect, FormEvent } from 'react';
import { Camera, Shield, AlertTriangle, Settings as SettingsIcon, Plane, Video } from 'lucide-react';
import CameraStream from './components/CameraStream';
import DetectionOverlay from './components/DetectionOverlay';
import EventsList from './components/EventsList';
import SettingsPanel from './components/SettingsPanel';
import MissionDashboard from './components/MissionDashboard';
import HlsVideoPlayer from './components/HlsVideoPlayer';
import { ProtectedRoute, UserProfileDropdown } from './components/Auth0Components';
import syncQueueService from './utils/syncQueue';
import localStorageService, { SecurityEvent as StoredSecurityEvent } from './utils/storage';

interface DetectedObject {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  timestamp: Date;
}

interface SecurityEvent {
  id: string;
  type: 'detection' | 'anomaly' | 'alert';
  message: string;
  timestamp: Date;
  objects?: DetectedObject[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detections?: any[];
  confidence?: number;
  imageBlob?: Blob;
  videoBlob?: Blob;
  metadata?: {
    deviceId: string;
    location?: string;
    cameraId: string;
    duration?: number;
  };
}

interface Settings {
  confidenceThreshold: number;
  humanDetection: boolean;
  motionDetection: boolean;
  notifications: boolean;
  cloudSync: boolean;
  azureConfig?: {
    accountName: string;
    containerName: string;
    sasToken?: string;
  };
}

function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'events' | 'cameras' | 'drone' | 'settings'>('live');
  const [settings, setSettings] = useState<Settings>({
    confidenceThreshold: 0.5,
    humanDetection: true,
    motionDetection: true,
    notifications: true,
    cloudSync: false,
    azureConfig: undefined
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [droneConnected, setDroneConnected] = useState(false);

  // ─── Multi-stream camera state ───────────────────────────────────────────────
  interface StreamInfo { id: string; name: string; url: string; active: boolean; hlsUrl: string | null; }
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [addCamId, setAddCamId] = useState('');
  const [addCamName, setAddCamName] = useState('');
  const [addCamUrl, setAddCamUrl] = useState('');
  const [addCamBusy, setAddCamBusy] = useState(false);
  const [thermalProbing, setThermalProbing] = useState(false);

  // Poll all streams every 5 s
  useEffect(() => {
    const poll = () =>
      fetch('/api/streams').then(r => r.json()).then(setStreams).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const handleAddCamera = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!addCamId.trim() || !addCamUrl.trim()) return;
    setAddCamBusy(true);
    try {
      await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: addCamId.trim(), name: addCamName.trim() || addCamId.trim(), url: addCamUrl.trim() }),
      });
      setAddCamId(''); setAddCamName(''); setAddCamUrl('');
      // refresh
      fetch('/api/streams').then(r => r.json()).then(setStreams).catch(() => {});
    } finally {
      setAddCamBusy(false);
    }
  }, [addCamId, addCamName, addCamUrl]);

  const handleRemoveCamera = useCallback((id: string) => {
    fetch(`/api/streams/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() =>
      fetch('/api/streams').then(r => r.json()).then(setStreams)
    ).catch(() => {});
  }, []);

  const handleThermalProbe = useCallback(async () => {
    setThermalProbing(true);
    try {
      await fetch('/api/thermal/probe', { method: 'POST' });
      fetch('/api/streams').then(r => r.json()).then(setStreams).catch(() => {});
    } finally {
      setThermalProbing(false);
    }
  }, []);

  // Poll drone connection status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/drone/status');
        const data = await res.json();
        setDroneConnected(data.status === 'connected');
      } catch {
        setDroneConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDronePause = () =>
    fetch('/api/drone/pause', { method: 'POST' }).catch(console.error);
  const handleDroneRTH = () =>
    fetch('/api/drone/return-home', { method: 'POST' }).catch(console.error);
  const handleDroneEmergency = () =>
    fetch('/api/drone/emergency-land', { method: 'POST' }).catch(console.error);

  // Initialize database first
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        await localStorageService.initialize();
        console.log('✅ Database initialized successfully');
        
        // Initialize sync service after database is ready
        await syncQueueService.initialize();
        console.log('✅ Sync service initialized successfully');
        
        setDatabaseReady(true);
      } catch (error) {
        console.error('❌ Failed to initialize database or sync service:', error);
      }
    };

    initializeDatabase();
  }, []);

  // Helper function to convert stored events to display format
  const convertStoredEvent = (storedEvent: StoredSecurityEvent): SecurityEvent => {
    // Determine severity based on detections
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (storedEvent.detections.some(d => d.className === 'person')) {
      severity = 'high';
    } else if (storedEvent.confidence > 0.8) {
      severity = 'high';
    } else if (storedEvent.confidence > 0.6) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    // Create display message
    const detectionNames = storedEvent.detections.map(d => d.className).join(', ');
    const message = detectionNames 
      ? `${detectionNames} detected with ${(storedEvent.confidence * 100).toFixed(1)}% confidence`
      : `${storedEvent.type} event`;

    return {
      id: storedEvent.id,
      type: storedEvent.type as 'detection' | 'anomaly' | 'alert',
      message,
      timestamp: storedEvent.timestamp,
      objects: storedEvent.detections.map(d => ({
        class: d.className,
        confidence: d.score,
        bbox: d.bbox,
        timestamp: storedEvent.timestamp
      })),
      severity,
      detections: storedEvent.detections,
      confidence: storedEvent.confidence,
      imageBlob: storedEvent.imageBlob,
      videoBlob: storedEvent.videoBlob,
      metadata: storedEvent.metadata
    };
  };

  // Load settings from storage on startup
  useEffect(() => {
    if (!databaseReady) return; // Wait for database initialization

    const loadSettings = async () => {
      try {
        const storedSettings = await localStorageService.getSettings();
        if (storedSettings) {
          console.log('📋 Loaded settings from storage:', storedSettings);
          setSettings({
            confidenceThreshold: storedSettings.alertThreshold,
            humanDetection: true, // This maps to detection being enabled
            motionDetection: true, // This maps to detection being enabled
            notifications: true, // We can add this to AppSettings later
            cloudSync: storedSettings.cloudSync,
            azureConfig: storedSettings.azureConfig
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, [databaseReady]);

  // Save settings to storage whenever they change
  useEffect(() => {
    if (!settingsLoaded) return; // Don't save until initial load is complete

    const saveSettings = async () => {
      try {
        await localStorageService.saveSettings({
          alertThreshold: settings.confidenceThreshold,
          recordingEnabled: true, // We can make this configurable later
          cloudSync: settings.cloudSync,
          syncOnlyOnWifi: false, // We can make this configurable later
          maxLocalStorageMB: 100, // Default limit
          retentionDays: 30, // Default retention
          azureConfig: settings.azureConfig
        });
        console.log('💾 Settings saved to storage');
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };

    saveSettings();
  }, [settings, settingsLoaded]);

  // Load events from storage
  // Load events from storage and set up refresh
  useEffect(() => {
    if (!databaseReady) return; // Wait for database initialization

    const loadEvents = async () => {
      try {
        const storedEvents = await localStorageService.getEvents({ limit: 100 });
        if (storedEvents.length > 0) {
          console.log('📚 Loaded events from storage:', storedEvents.length);
          // Debug: Check if blobs are present
          storedEvents.forEach(event => {
            console.log(`🔍 Event ${event.id}: imageBlob=${!!event.imageBlob}, videoBlob=${!!event.videoBlob}, imageSize=${event.imageBlob?.size}, videoSize=${event.videoBlob?.size}`);
          });
          const convertedEvents = storedEvents.map(convertStoredEvent);
          setSecurityEvents(convertedEvents);
        }
      } catch (error) {
        console.error('Failed to load events:', error);
      }
    };

    loadEvents();
    
    // Refresh events every 5 seconds to pick up new ones
    const refreshInterval = setInterval(loadEvents, 5000);
    
    return () => clearInterval(refreshInterval);
  }, [databaseReady]);

  // Handle object detection results
  const handleDetection = useCallback((objects: DetectedObject[]) => {
    setDetectedObjects(objects);

    // Create security events for significant detections
    objects.forEach(obj => {
      if (obj.confidence > settings.confidenceThreshold) {
        const event: SecurityEvent = {
          id: Date.now().toString() + Math.random().toString(36),
          type: 'detection',
          message: `${obj.class} detected with ${(obj.confidence * 100).toFixed(1)}% confidence`,
          timestamp: new Date(),
          objects: [obj],
          severity: obj.class === 'person' ? 'high' : 'medium'
        };

        setSecurityEvents(prev => [event, ...prev.slice(0, 99)]); // Keep last 100 events
      }
    });
  }, [settings.confidenceThreshold]);

  // Start/stop monitoring
  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    
    if (!isMonitoring) {
      const event: SecurityEvent = {
        id: Date.now().toString(),
        type: 'alert',
        message: 'Security monitoring started',
        timestamp: new Date(),
        severity: 'low'
      };
      setSecurityEvents(prev => [event, ...prev]);
    } else {
      const event: SecurityEvent = {
        id: Date.now().toString(),
        type: 'alert',
        message: 'Security monitoring stopped',
        timestamp: new Date(),
        severity: 'low'
      };
      setSecurityEvents(prev => [event, ...prev]);
    }
  };

  // Request notification permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Send notifications for high-severity events
  useEffect(() => {
    if (settings.notifications && securityEvents.length > 0) {
      const latestEvent = securityEvents[0];
      if (latestEvent.severity === 'high' || latestEvent.severity === 'critical') {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Security Alert', {
            body: latestEvent.message,
            icon: '/pwa-192x192.png'
          });
        }
      }
    }
  }, [securityEvents, settings.notifications]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-black p-4" style={{borderBottom: '1px solid rgba(0,255,255,0.3)', boxShadow: '0 2px 12px rgba(0,255,255,0.08)'}}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8" style={{color: '#00ffff'}} />
            <div>
              <h1 className="text-xl font-bold" style={{color: '#00ffff'}}>privaseeAI</h1>
              <p className="text-xs" style={{color: 'rgba(0,255,255,0.5)'}}>The Sentinel</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Status indicators */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              isMonitoring ? 'bg-green-900 text-green-300 border border-green-500' : 'bg-black text-gray-400 border border-gray-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isMonitoring ? 'bg-white animate-pulse' : 'bg-gray-400'
              }`} />
              <span>{isMonitoring ? 'Monitoring' : 'Offline'}</span>
            </div>

            {/* Event count */}
            {securityEvents.length > 0 && (
              <div className="flex items-center space-x-1 text-sm text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{securityEvents.length}</span>
              </div>
            )}

            {/* User Authentication */}
            <UserProfileDropdown />
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-[#0a0a0a]" style={{borderBottom: '1px solid rgba(0,255,255,0.2)'}}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex space-x-6 overflow-x-auto">
            {[
              { id: 'live', label: 'Live View', icon: Camera },
              { id: 'events', label: 'Events', icon: AlertTriangle },
              { id: 'cameras', label: 'Cameras', icon: Video },
              { id: 'drone', label: 'Drone', icon: Plane },
              { id: 'settings', label: 'Settings', icon: SettingsIcon }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className="flex items-center space-x-2 py-4 border-b-2 transition-all whitespace-nowrap text-sm"
                  style={isActive
                    ? { borderColor: '#00ffff', color: '#00ffff', textShadow: '0 0 8px rgba(0,255,255,0.5)' }
                    : { borderColor: 'transparent', color: '#9ca3af' }
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        {activeTab === 'live' && (
          <div className="space-y-6">
            {/* Camera View */}
            <div className="rounded-lg overflow-hidden" style={{background: '#0a0a0a', border: '1px solid rgba(0,255,255,0.15)'}}>
              <div className="relative bg-black w-full" style={{height: '58vh'}}>
                <CameraStream
                  onDetection={handleDetection}
                  isActive={isMonitoring}
                />
                
                {/* Detection Overlays */}
                {isMonitoring && detectedObjects.length > 0 && (
                  <DetectionOverlay objects={detectedObjects} />
                )}

                {/* Inactive placeholder — shown when not monitoring */}
                {!isMonitoring && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20" style={{background: 'rgba(0,0,0,0.97)'}}>
                    <Shield className="h-20 w-20 mb-6" style={{color: 'rgba(0,255,255,0.3)'}}/>
                    <p className="text-2xl font-bold mb-2" style={{color: '#00ffff'}}>The Sentinel</p>
                    <p className="text-sm mb-2" style={{color: 'rgba(255,255,255,0.4)'}}>Live monitoring is inactive</p>
                    <p className="text-xs mb-8 text-center max-w-xs" style={{color: 'rgba(255,255,255,0.25)'}}>
                      Your device camera will activate. Allow permission when prompted.
                    </p>
                    <button
                      onClick={toggleMonitoring}
                      className="px-10 py-4 rounded-xl font-bold text-xl transition-all flex items-center space-x-3 hover:scale-105"
                      style={{background: '#00ffff', color: '#000000', boxShadow: '0 0 30px rgba(0,255,255,0.5)'}}
                    >
                      <Camera className="h-6 w-6" />
                      <span>Activate Sentinel</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4" style={{borderTop: '1px solid rgba(0,255,255,0.1)'}}>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={toggleMonitoring}
                    className="px-6 py-2 rounded-lg font-semibold transition-all flex items-center space-x-2"
                    style={isMonitoring
                      ? {background: '#ff4444', color: '#fff', boxShadow: '0 0 12px rgba(255,68,68,0.4)'}
                      : {background: '#00ffff', color: '#000', boxShadow: '0 0 12px rgba(0,255,255,0.4)'}
                    }
                  >
                    <Camera className="h-4 w-4" />
                    <span>{isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}</span>
                  </button>

                  {detectedObjects.length > 0 && (
                    <div className="text-sm" style={{color: '#00ffff'}}>
                      {detectedObjects.length} objects detected
                    </div>
                  )}

                  <div className="flex-1" />

                  <label className="flex items-center space-x-2 text-sm cursor-pointer" style={{color: 'rgba(255,255,255,0.6)'}}>
                    <input
                      type="checkbox"
                      checked={settings.humanDetection}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        humanDetection: e.target.checked
                      }))}
                      className="rounded"
                      style={{accentColor: '#00ffff'}}
                    />
                    <span>Human Detection</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Recent Events Preview */}
            {securityEvents.length > 0 && (
              <div className="rounded-lg p-4" style={{background: '#0a0a0a', border: '1px solid rgba(0,255,255,0.15)'}}>
                <h3 className="text-lg font-medium mb-4" style={{color: '#00ffff'}}>Recent Events</h3>
                <div className="space-y-2">
                  {securityEvents.slice(0, 3).map(event => (
                    <div key={event.id} className="flex items-center justify-between p-2 rounded" style={{background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(0,255,255,0.08)'}}>  
                      <div>
                        <p className="text-sm font-medium">{event.message}</p>
                        <p className="text-xs text-gray-400">
                          {event.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        event.severity === 'critical' ? 'bg-red-500' :
                        event.severity === 'high' ? 'bg-orange-500' :
                        event.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}>
                        {event.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <EventsList events={securityEvents} />
        )}

        {activeTab === 'cameras' && (
          <div className="space-y-6">
            {/* Add camera form */}
            <div className="rounded-xl p-4" style={{background: '#0a0a0a', border: '1px solid rgba(0,255,255,0.15)'}}>
              <h3 className="text-sm font-semibold mb-3" style={{color: '#00ffff'}}>Add IP / RTSP Camera</h3>
              <form onSubmit={handleAddCamera} className="flex flex-wrap gap-2">
                <input
                  className="flex-1 min-w-32 rounded px-3 py-2 text-sm placeholder-gray-500"
                  style={{background: '#111', border: '1px solid rgba(0,255,255,0.2)', color: 'white'}}
                  placeholder="ID (e.g. cam1)"
                  value={addCamId}
                  onChange={e => setAddCamId(e.target.value)}
                />
                <input
                  className="flex-1 min-w-32 rounded px-3 py-2 text-sm"
                  style={{background:'#111',border:'1px solid rgba(0,255,255,0.2)',color:'white'}}
                  placeholder="Name (optional)"
                  value={addCamName}
                  onChange={e => setAddCamName(e.target.value)}
                />
                <input
                  className="flex-[2] min-w-48 rounded px-3 py-2 text-sm placeholder-gray-500"
                  style={{background: '#111', border: '1px solid rgba(0,255,255,0.2)', color: 'white'}}
                  placeholder="rtsp://192.168.x.x:554/stream"
                  value={addCamUrl}
                  onChange={e => setAddCamUrl(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={addCamBusy || !addCamId.trim() || !addCamUrl.trim()}
                  className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-all"
                  style={{background: '#00ffff', color: '#000', boxShadow: '0 0 8px rgba(0,255,255,0.3)'}}
                >
                  {addCamBusy ? 'Starting…' : 'Add'}
                </button>
              </form>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-gray-500">AGM Taipan V2:</span>
                <button
                  onClick={handleThermalProbe}
                  disabled={thermalProbing}
                  className="px-3 py-1 text-xs bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded font-medium"
                >
                  {thermalProbing ? 'Probing…' : 'Auto-detect thermal'}
                </button>
              </div>
            </div>

            {/* Stream grid */}
            {streams.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-xl text-sm" style={{background: '#0a0a0a', color: 'rgba(0,255,255,0.4)', border: '1px dashed rgba(0,255,255,0.2)'}}>
                No streams active — add a camera above
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {streams.map(s => (
                  <div key={s.id} className="rounded-xl overflow-hidden" style={{background: '#0a0a0a', border: '1px solid rgba(0,255,255,0.15)'}}>  
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-750">
                      <span className="text-sm font-medium" style={{color: '#00ffff'}}>{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${s.active ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                        <button
                          onClick={() => handleRemoveCamera(s.id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded"
                        >
                          Stop
                        </button>
                      </div>
                    </div>
                    {s.hlsUrl ? (
                      <HlsVideoPlayer src={s.hlsUrl} label={s.name} className="w-full" />
                    ) : (
                      <div className="flex items-center justify-center h-36 text-gray-500 text-xs">
                        {s.active ? 'Buffering…' : 'Stream stopped'}
                      </div>
                    )}
                    <div className="px-3 py-1 text-xs text-gray-600 truncate">{s.url}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'drone' && (
          <div className="space-y-4">
            {/* Connection status banner */}
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
              droneConnected ? '' : ''
            }`}
              style={droneConnected
                ? {background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)'}
                : {background: '#0a0a0a', color: '#6b7280', border: '1px solid rgba(255,255,255,0.1)'}
              }>
              <Plane className="h-4 w-4" />
              <span>{droneConnected ? 'Autel EVO Lite — Connected' : 'Drone not connected — connect your Mac to the drone WiFi and restart the server'}</span>
            </div>
            <MissionDashboard
              missionId="autel-evo-lite"
              websocketUrl={`ws://${window.location.host}/ws/drone`}
              onPause={handleDronePause}
              onReturnHome={handleDroneRTH}
              onEmergencyLand={handleDroneEmergency}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
          />
        )}
      </main>
    </div>
  );
}

// Wrap App with Authentication
function AuthenticatedApp() {
  return (
    <ProtectedRoute>
      <App />
    </ProtectedRoute>
  );
}

export default AuthenticatedApp;