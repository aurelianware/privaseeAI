import { useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import { Camera, AlertTriangle, Settings as SettingsIcon, Plane, Video, Circle, Square, CreditCard } from 'lucide-react';
import { useAccount, useMsal } from '@azure/msal-react';
import CameraStream from './components/CameraStream';
import DetectionOverlay from './components/DetectionOverlay';
import EventsList from './components/EventsList';
import SettingsPanel from './components/SettingsPanel';
import MissionDashboard from './components/MissionDashboard';
import MissionLauncher from './components/MissionLauncher';
import HlsVideoPlayer from './components/HlsVideoPlayer';
import CallPanel from './components/CallPanel';
import PricingSection from './components/PricingSection';
import SubscriptionStatus from './components/SubscriptionStatus';
import { ProtectedRoute, UserProfileDropdown } from './components/Auth0Components';
import syncQueueService from './utils/syncQueue';
import localStorageService, { SecurityEvent as StoredSecurityEvent } from './utils/storage';
import { useUserSettings } from './hooks/useUserSettings';

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
  managedContainer?: boolean;
  azureConfig?: {
    accountName: string;
    containerName: string;
    sasToken?: string;
  };
}

function App() {
  // Current user identity (for call panel)
  const { accounts } = useMsal();
  const msalAccount   = useAccount(accounts[0] ?? null);
  const currentOid    = msalAccount?.localAccountId ?? '';
  const currentName   = msalAccount?.name ?? msalAccount?.username ?? 'Unknown';

  // Refs to HLS <video> elements keyed by stream ID, for captureStream() sharing
  const hlsVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const [isMonitoring, setIsMonitoring] = useState(true);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'events' | 'cameras' | 'drone' | 'settings' | 'billing'>('live');
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
  const { loadFromServer, saveToServer } = useUserSettings();
  const [droneConnected, setDroneConnected] = useState(false);
  const [missionActive, setMissionActive] = useState(false);
  const [droneStreams, setDroneStreams] = useState<{ visual: string | null; thermal: string | null }>({ visual: null, thermal: null });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const manualRecorderRef = useRef<MediaRecorder | null>(null);
  const manualChunksRef = useRef<Blob[]>([]);

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

  const handleDroneConnect = useCallback(async () => {
    const res = await fetch('/api/drone/connect', { method: 'POST' });
    const data = await res.json();
    if (data.connected) {
      setDroneConnected(true);
      setDroneStreams({ visual: data.visualHls ?? null, thermal: data.thermalHls ?? null });
    }
  }, []);

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

        // Seed Azure config from env vars if not already stored
        const envAzureAccount = import.meta.env.VITE_AZURE_STORAGE_ACCOUNT;
        const envAzureContainer = import.meta.env.VITE_AZURE_STORAGE_CONTAINER;
        const envAzureSasToken = import.meta.env.VITE_AZURE_SAS_TOKEN;
        const envAzureConfig = (envAzureAccount && envAzureContainer && envAzureSasToken)
          ? { accountName: envAzureAccount, containerName: envAzureContainer, sasToken: envAzureSasToken }
          : undefined;

        // Build base settings from IndexedDB / env vars
        const baseAzureConfig = storedSettings?.azureConfig ?? envAzureConfig;
        if (storedSettings) {
          setSettings({
            confidenceThreshold: storedSettings.alertThreshold,
            humanDetection: true,
            motionDetection: true,
            notifications: true,
            cloudSync: storedSettings.cloudSync,
            azureConfig: baseAzureConfig
          });
        } else if (envAzureConfig) {
          setSettings(prev => ({ ...prev, cloudSync: true, azureConfig: envAzureConfig }));
        }

        // Override with server-side settings (source of truth for multi-device)
        const remote = await loadFromServer();
        if (remote) {
          console.log('☁️ Loaded settings from server (multi-tenant)');
          setSettings(prev => ({
            ...prev,
            ...(remote.confidenceThreshold !== undefined && { confidenceThreshold: remote.confidenceThreshold }),
            ...(remote.cloudSync !== undefined && { cloudSync: remote.cloudSync }),
            ...(remote.managedContainer !== undefined && { managedContainer: remote.managedContainer }),
            azureConfig: (remote.azureAccountName && remote.azureContainerName && remote.sasToken)
              ? { accountName: remote.azureAccountName, containerName: remote.azureContainerName, sasToken: remote.sasToken }
              : prev.azureConfig
          }));
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
          recordingEnabled: true,
          cloudSync: settings.cloudSync,
          syncOnlyOnWifi: false,
          maxLocalStorageMB: 100,
          retentionDays: 30,
          azureConfig: settings.azureConfig
        });
        console.log('💾 Settings saved to local storage');

        // Also persist to server so any future device/login gets the same settings
        const saved = await saveToServer({
          confidenceThreshold: settings.confidenceThreshold,
          cloudSync: settings.cloudSync,
          azureAccountName: settings.azureConfig?.accountName,
          azureContainerName: settings.azureConfig?.containerName,
          sasToken: settings.azureConfig?.sasToken,
        });
        if (saved) console.log('☁️ Settings synced to server');
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };

    saveSettings();
  }, [settings, settingsLoaded]);

  // Load events from storage and set up refresh
  useEffect(() => {
    if (!databaseReady) return;

    const loadEvents = async () => {
      try {
        const storedEvents = await localStorageService.getEvents({ limit: 100 });
        if (storedEvents.length > 0) {
          const convertedEvents = storedEvents.map(convertStoredEvent);
          setSecurityEvents(convertedEvents);
        }
      } catch (error) {
        // Swallow IDB transient errors silently
      }
    };

    loadEvents();
    const refreshInterval = setInterval(loadEvents, 10000);
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

  const toggleRecording = () => {
    if (!cameraStream) return;
    if (isRecording && manualRecorderRef.current) {
      manualRecorderRef.current.stop();
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(cameraStream, { mimeType });
    manualChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) manualChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(manualChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinel-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
    };
    recorder.start(250);
    manualRecorderRef.current = recorder;
    setIsRecording(true);
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
    <div className="min-h-screen text-white" style={{
      background: '#000',
      backgroundImage: 'url(/privaseeai-kubrick.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center 35%',
      backgroundAttachment: 'fixed',
      position: 'relative',
    }}>
      {/* Kubrick overlay — heavy vignette, lets the cold-war teal and grain breathe */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,4,8,0.80) 50%, rgba(0,0,0,0.93) 100%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      {/* All content sits above the overlay */}
      <div style={{position: 'relative', zIndex: 1}}>
      {/* Header */}
      <header style={{background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', borderBottom: '1px solid rgba(0,200,220,0.25)', boxShadow: '0 1px 0 rgba(0,255,255,0.08), 0 4px 32px rgba(0,0,0,0.6)', padding: '12px 16px'}}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          {/* Logo — animated video on dark header, screened so black disappears */}
          <div className="flex items-center gap-3" style={{minWidth: 0}}>
            <div style={{flexShrink: 0, position: 'relative'}}>
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="/logo/privaseeai-logo-poster.jpg"
                style={{
                  height: 48,
                  width: 'auto',
                  display: 'block',
                  mixBlendMode: 'screen',
                  filter: 'drop-shadow(0 0 10px rgba(0,255,255,0.55)) drop-shadow(0 0 22px rgba(0,255,136,0.25))',
                  borderRadius: 4,
                }}
              >
                <source src="/logo/privaseeai-logo.webm" type="video/webm" />
                <source src="/logo/privaseeai-logo.mp4"  type="video/mp4" />
              </video>
            </div>
            <div style={{lineHeight: 1}}>
              <p style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(0,255,255,0.45)',
                fontFamily: "'Segoe UI', sans-serif",
              }}>The Sentinel</p>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            {/* Status pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 14px', borderRadius: 999, fontSize: 12,
              whiteSpace: 'nowrap', fontFamily: "'Segoe UI', sans-serif",
              letterSpacing: '0.06em', fontWeight: 600,
              ...(isMonitoring
                ? {background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.35)'}
                : {background: 'rgba(0,0,0,0.4)', color: 'rgba(180,180,180,0.7)', border: '1px solid rgba(255,255,255,0.12)'})
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isMonitoring ? '#00ff88' : '#555',
                boxShadow: isMonitoring ? '0 0 6px #00ff88' : 'none',
                animation: isMonitoring ? 'pulse 1.5s infinite' : 'none',
              }} />
              {isMonitoring ? 'Live' : 'Offline'}
            </div>

            {/* Event count */}
            {securityEvents.length > 0 && (
              <div style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,180,60,0.9)', whiteSpace: 'nowrap'}}>
                <AlertTriangle size={13} />
                <span>{securityEvents.length}</span>
              </div>
            )}

            {/* User Authentication */}
            <UserProfileDropdown />
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav style={{background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,200,220,0.15)'}}>
        <div style={{maxWidth: 1152, margin: '0 auto', padding: '0 16px'}}>
          <div style={{display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none'}}>
            {[
              { id: 'live', label: 'Live View', icon: Camera },
              { id: 'events', label: 'Events', icon: AlertTriangle },
              { id: 'cameras', label: 'Cameras', icon: Video },
              { id: 'drone', label: 'Drone', icon: Plane },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
              { id: 'billing', label: 'Billing', icon: CreditCard }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '14px 20px', whiteSpace: 'nowrap',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    letterSpacing: '0.05em',
                    borderBottom: isActive ? '2px solid rgba(0,220,255,0.9)' : '2px solid transparent',
                    color: isActive ? 'rgba(0,220,255,0.95)' : 'rgba(160,170,180,0.7)',
                    textShadow: isActive ? '0 0 10px rgba(0,220,255,0.35)' : 'none',
                    transition: 'color 0.15s, border-color 0.15s',
                    fontFamily: "'Segoe UI', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
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
            <div className="rounded-lg overflow-hidden" style={{background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(0,200,220,0.18)'}}>
              <div className="relative bg-black w-full" style={{aspectRatio: '16/9', maxHeight: '65vh'}}>
                <CameraStream
                  onDetection={handleDetection}
                  isActive={true}
                  onStreamReady={setCameraStream}
                />
                
                {/* Detection Overlays */}
                {isMonitoring && detectedObjects.length > 0 && (
                  <DetectionOverlay objects={detectedObjects} />
                )}

                {/* Paused overlay — brand image fills the feed area */}
                {!isMonitoring && (
                  <div className="absolute inset-0 flex flex-col items-end justify-end" style={{
                    backgroundImage: 'url(/privaseeai-brand.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center 30%',
                    zIndex: 50,
                  }}>
                    {/* Gradient vignette over image */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(135deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)',
                    }} />
                    {/* Bottom-right control pill */}
                    <div style={{
                      position: 'relative', zIndex: 1,
                      padding: '20px 24px',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                        textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
                        fontFamily: "'Segoe UI', sans-serif",
                      }}>Monitoring Paused</span>
                      <button
                        onClick={toggleMonitoring}
                        className="flex items-center space-x-2 hover:scale-105 transition-transform"
                        style={{
                          background: '#00ffff', color: '#000',
                          border: 'none', borderRadius: 8,
                          padding: '8px 20px', fontWeight: 700, fontSize: 14,
                          boxShadow: '0 0 24px rgba(0,255,255,0.6), 0 0 60px rgba(0,255,255,0.2)',
                          cursor: 'pointer', letterSpacing: '0.04em',
                          fontFamily: "'Segoe UI', sans-serif",
                        }}
                      >
                        <Camera className="h-4 w-4" style={{marginRight: 6}} />
                        Resume
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{borderTop: '1px solid rgba(0,200,220,0.12)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '12px 16px'}}>
                {/* Row 1: primary action buttons */}
                <div style={{display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
                  <button
                    onClick={toggleMonitoring}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 20px', borderRadius: 8, border: 'none',
                      fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
                      letterSpacing: '0.04em', fontFamily: "'Segoe UI', sans-serif",
                      transition: 'box-shadow 0.2s',
                      ...(isMonitoring
                        ? {background: '#ff4444', color: '#fff', boxShadow: '0 0 14px rgba(255,68,68,0.45)'}
                        : {background: '#00ffff', color: '#000', boxShadow: '0 0 14px rgba(0,255,255,0.45)'})
                    }}
                  >
                    <Camera size={15} />
                    {isMonitoring ? 'Stop' : 'Start'}
                  </button>

                  {isMonitoring && cameraStream && (
                    <button
                      onClick={toggleRecording}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                        fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                        letterSpacing: '0.04em', fontFamily: "'Segoe UI', sans-serif",
                        transition: 'box-shadow 0.2s',
                        ...(isRecording
                          ? {background: '#ff4444', color: '#fff', border: 'none', boxShadow: '0 0 14px rgba(255,68,68,0.5)'}
                          : {background: 'transparent', color: '#ff4444', border: '1px solid rgba(255,68,68,0.6)'})
                      }}
                    >
                      {isRecording ? <Square size={13} /> : <Circle size={13} />}
                      {isRecording ? 'Stop Rec' : 'Record'}
                      {isRecording && <span style={{color: '#ff4444', animation: 'pulse 1s infinite'}}>●</span>}
                    </button>
                  )}

                  {detectedObjects.length > 0 && (
                    <span style={{fontSize: 12, color: 'rgba(0,220,255,0.8)', whiteSpace: 'nowrap', letterSpacing: '0.06em'}}>
                      {detectedObjects.length} detected
                    </span>
                  )}

                  <div style={{flex: 1}} />

                  <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'rgba(200,210,220,0.7)', whiteSpace: 'nowrap', letterSpacing: '0.05em'}}>
                    <input
                      type="checkbox"
                      checked={settings.humanDetection}
                      onChange={(e) => setSettings(prev => ({...prev, humanDetection: e.target.checked}))}
                      style={{accentColor: '#00ffff', width: 14, height: 14}}
                    />
                    Human Detection
                  </label>
                </div>
              </div>
            </div>

            {/* Recent Events Preview */}
            {securityEvents.length > 0 && (
              <div className="rounded-lg p-4" style={{background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(0,200,220,0.15)'}}>
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
            <div className="rounded-xl p-4" style={{background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(0,200,220,0.18)'}}>
              <h3 style={{fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,220,255,0.8)', marginBottom: 12, fontFamily: "'Segoe UI', sans-serif"}}>Add IP / RTSP Camera</h3>
              <form onSubmit={handleAddCamera} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                <input
                  style={{background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,200,220,0.22)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'white', outline: 'none', fontFamily: "'Segoe UI', sans-serif"}}
                  placeholder="ID (e.g. cam1)"
                  value={addCamId}
                  onChange={e => setAddCamId(e.target.value)}
                />
                <input
                  style={{background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,200,220,0.22)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'white', outline: 'none', fontFamily: "'Segoe UI', sans-serif"}}
                  placeholder="Name (optional)"
                  value={addCamName}
                  onChange={e => setAddCamName(e.target.value)}
                />
                <input
                  style={{gridColumn: '1 / -1', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,200,220,0.22)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'white', outline: 'none', fontFamily: "'Segoe UI', sans-serif"}}
                  placeholder="rtsp://192.168.x.x:554/stream"
                  value={addCamUrl}
                  onChange={e => setAddCamUrl(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={addCamBusy || !addCamId.trim() || !addCamUrl.trim()}
                  style={{gridColumn: '1 / -1', background: '#00ffff', color: '#000', border: 'none', borderRadius: 7, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', boxShadow: '0 0 12px rgba(0,255,255,0.3)', opacity: (addCamBusy || !addCamId.trim() || !addCamUrl.trim()) ? 0.45 : 1, fontFamily: "'Segoe UI', sans-serif", whiteSpace: 'nowrap'}}
                >
                  {addCamBusy ? 'Starting…' : 'Add Camera'}
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
              <div className="flex items-center justify-center h-40 rounded-xl text-sm" style={{background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', color: 'rgba(0,220,240,0.4)', border: '1px dashed rgba(0,200,220,0.2)'}}>
                No streams active — add a camera above
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {streams.map(s => (
                  <div key={s.id} className="rounded-xl overflow-hidden" style={{background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(0,200,220,0.18)'}}>  
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
                      <HlsVideoPlayer
                        src={s.hlsUrl}
                        label={s.name}
                        className="w-full"
                        ref={(el) => {
                          if (el) hlsVideoRefs.current.set(s.id, el);
                          else hlsVideoRefs.current.delete(s.id);
                        }}
                      />
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
          missionActive
            ? <MissionDashboard
                missionId="autel-evo-lite"
                websocketUrl={`ws://${window.location.host}/ws/mission`}
                visualStreamUrl={droneStreams.visual}
                thermalStreamUrl={droneStreams.thermal}
                onPause={handleDronePause}
                onReturnHome={handleDroneRTH}
                onEmergencyLand={handleDroneEmergency}
                onMissionEnd={() => setMissionActive(false)}
              />
            : <MissionLauncher
                droneConnected={droneConnected}
                droneStreams={droneStreams}
                onConnect={handleDroneConnect}
                onMissionLaunched={() => setMissionActive(true)}
              />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
          />
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            <SubscriptionStatus />
            <PricingSection />
          </div>
        )}
      </main>

      {/* Floating call panel — always available regardless of active tab */}
      {currentOid && (
        <CallPanel
          entraOid={currentOid}
          displayName={currentName}
          webcamStream={cameraStream}
          hlsStreams={streams}
          hlsVideoRefs={hlsVideoRefs}
        />
      )}
      </div>{/* end content wrapper */}
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