import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import YOLOModel, { YOLODetection } from '../utils/yolo';
import localStorageService from '../utils/storage';
import syncQueueService from '../utils/syncQueue';

interface DetectedObject {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  timestamp: Date;
}

interface CameraStreamProps {
  onDetection: (objects: DetectedObject[]) => void;
  isActive: boolean;
  onStreamReady?: (stream: MediaStream | null) => void;
  subscriptionTier?: string; // 'FREE' | 'PRO' | 'ENTERPRISE' — gates YOLOv8
}

const CameraStream: React.FC<CameraStreamProps> = ({ onDetection, isActive, onStreamReady, subscriptionTier }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const yoloModelRef = useRef<YOLOModel | null>(null);
  const detectionLoopRef = useRef<number | undefined>(undefined);
  // Event-window recording refs
  const eventActiveRef      = useRef(false);
  const eventStartTimeRef   = useRef(0);
  const eventFramesRef      = useRef<Blob[]>([]);
  const eventChunksRef      = useRef<Blob[]>([]);
  const eventFrameTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRecorderRef    = useRef<MediaRecorder | null>(null);
  const eventAnimIdRef      = useRef<number>(0);
  const eventDetectionsRef  = useRef<YOLODetection[]>([]);
  
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelBackend, setModelBackend] = useState<'yolov8' | 'coco-ssd' | 'none'>('none');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [requestingCamera, setRequestingCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const [currentDetections, setCurrentDetections] = useState<YOLODetection[]>([]);
  const [recordedEvents, setRecordedEvents] = useState<number>(0);

  // Initialize TensorFlow.js and load YOLO model
  useEffect(() => {
    const initializeYOLO = async () => {
      try {
        setIsModelLoading(true);
        
        // Initialize TensorFlow.js backend
        await tf.ready();
        console.log('TensorFlow.js backend:', tf.getBackend());

        yoloModelRef.current = new YOLOModel();

        const useYoloV8 = subscriptionTier === 'PRO' || subscriptionTier === 'ENTERPRISE';
        const modelLoaded = await yoloModelRef.current.loadModel(useYoloV8);

        if (!modelLoaded) {
          throw new Error('Failed to load detection model');
        }

        setModelBackend(yoloModelRef.current.backend);
        console.log('✅ Detection model loaded — backend:', yoloModelRef.current.backend);

        setIsModelLoading(false);

        // Camera may have already connected while the model was loading.
        // The loadedmetadata / canplay handlers are { once: true } and already
        // fired, so we must explicitly kick off the detection loop here.
        if (videoRef.current && videoRef.current.readyState >= 1 && !detectionLoopRef.current) {
          console.log('▶️ Model loaded after camera connected — starting detection loop now');
          startDetectionLoop();
        }

      } catch (err) {
        console.error('Failed to initialize YOLO:', err);
        setError('Failed to load AI model. Check console for details.');
        setIsModelLoading(false);
      }
    };

    initializeYOLO();
    
    return () => {
      // Cleanup
      if (yoloModelRef.current) {
        yoloModelRef.current.dispose();
      }
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, []);

  // Initialize camera stream
  useEffect(() => {
    console.log('🎥 CameraStream effect — isActive:', isActive, '| mediaDevices:', !!navigator.mediaDevices, '| protocol:', location.protocol);
    if (!isActive) return;

    // Use a local ref so the cleanup always has the actual stream,
    // avoiding the stale-closure bug where `stream` state is null at registration time.
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      setRequestingCamera(true);
      setError('');

      // Guard: getUserMedia requires a secure context (https or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg = `Camera API unavailable. Page must be served over HTTPS or localhost (current: ${location.protocol}//${location.host})`;
        console.error('❌', msg);
        setError(msg);
        setRequestingCamera(false);
        return;
      }

      console.log('📷 Calling getUserMedia...');
      try {
        // Try ideal constraints first, fall back to basic video if they fail
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode },
            audio: false
          });
        } catch (e1) {
          console.warn('⚠️ Ideal constraints failed, trying fallback:', e1);
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: false
          });
        }

        localStream = mediaStream;
        console.log('📷 Camera started, tracks:', mediaStream.getTracks().map(t => t.label));
        setStream(mediaStream);
        setRequestingCamera(false);
        onStreamReady?.(mediaStream);
        
        if (videoRef.current) {
          const video = videoRef.current;

          // Attach event handlers BEFORE setting srcObject so no events are missed
          const onMetadata = () => {
            console.log('📐 Video metadata loaded:', video.videoWidth, 'x', video.videoHeight);
            startDetectionLoop();
          };
          const onCanPlay = () => {
            // Fallback: if readyState advances without firing loadedmetadata
            if (video.videoWidth > 0 && !detectionLoopRef.current) {
              console.log('▶️ canplay fired - starting detection loop');
              startDetectionLoop();
            }
          };

          video.addEventListener('loadedmetadata', onMetadata, { once: true });
          video.addEventListener('canplay', onCanPlay, { once: true });

          video.srcObject = mediaStream;

          // For muted autoplay the browser should handle it, but call play() explicitly as well
          video.play().catch((e) => {
            console.error('▶️ video.play() failed:', e);
            setError('Video playback was blocked by the browser. Click Retry to start the camera stream.');
          });

          // If metadata already loaded (stream reuse edge-case), start immediately
          if (video.readyState >= 2) {
            console.log('📐 Video already ready (readyState', video.readyState, ')');
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('canplay', onCanPlay);
            startDetectionLoop();
          }
        }
        
        setError('');
      } catch (err: any) {
        console.error('Camera error:', err);
        setRequestingCamera(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Click the camera icon in your browser address bar and allow access, then click Retry.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(`Camera error: ${err.message || err.name}. Please try again.`);
        }
      }
    };

    startCamera();

    return () => {
      // Use localStream (not setState stream) to avoid stale-closure — `stream`
      // state is still null at the time this cleanup was registered.
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        setStream(null);
        onStreamReady?.(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
        detectionLoopRef.current = undefined;
      }
    };
  }, [isActive, facingMode]);

  const startDetectionLoop = () => {
    if (!yoloModelRef.current || !videoRef.current) return;

    const detectAndDraw = async () => {
      try {
        const video = videoRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        
        if (!video || !overlayCanvas || video.readyState !== 4) {
          detectionLoopRef.current = requestAnimationFrame(detectAndDraw);
          return;
        }

        // Ensure canvas matches video dimensions
        if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
        }

        // Run YOLO detection
        const detections = await yoloModelRef.current!.detect(video);
        setCurrentDetections(detections);

        // Convert YOLO detections to app format (filter for security-relevant objects)
        const securityRelevantClasses = [
          'person', 'car', 'truck', 'motorcycle', 'bicycle', 'bus', 'boat',
          'backpack', 'handbag', 'suitcase', 'bottle', 'knife', 'scissors'
        ];
        
        const appDetections: DetectedObject[] = detections
          .filter(det => securityRelevantClasses.includes(det.className) && det.score > 0.4) // Higher confidence threshold
          .map(det => ({
            class: det.className,
            confidence: det.score,
            bbox: [
              det.bbox[0] * video.videoWidth,  // x
              det.bbox[1] * video.videoHeight, // y
              det.bbox[2] * video.videoWidth,  // width
              det.bbox[3] * video.videoHeight  // height
            ],
            timestamp: new Date()
          }));

        // Send detections to parent component
        onDetection(appDetections);

        // Draw detection results FIRST to ensure overlay has current detections
        drawDetections(detections, overlayCanvas);

        // Wait for next frame to ensure overlay is rendered before saving
        await new Promise(resolve => requestAnimationFrame(() => resolve(void 0)));

        // Dispatch detections into the event window (open or extend it)
        const significant = detections.filter(d =>
          d.score > 0.5 ||
          ['person', 'car', 'truck', 'motorcycle', 'bus', 'bicycle', 'dog', 'cat'].includes(d.className)
        );
        if (significant.length > 0) {
          if (eventActiveRef.current) {
            scheduleWindowClose(video); // extend the existing window
          } else {
            void openEventWindow(significant, video); // start a new window
          }
        }

      } catch (err) {
        console.error('Detection error:', err);
      }

      // Continue detection loop with adaptive FPS based on device performance
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const detectionInterval = isMobile ? 150 : 100; // Slower on mobile for better performance
      
      setTimeout(() => {
        detectionLoopRef.current = requestAnimationFrame(detectAndDraw);
      }, detectionInterval);
    };

    detectAndDraw();
  };

  // ── Event-window recording ──────────────────────────────────────────────────
  //
  // Instead of a fixed 3-second clip per detection, an "event window" stays open
  // as long as detections keep arriving (max 30 s) and closes 3 s after the last
  // detection. One event (with multiple JPEG frames + a video clip) is saved per
  // window, regardless of how many detection-loop ticks fired during it.

  /** Capture the current video frame + live overlay as a JPEG Blob. */
  const captureCurrentFrame = async (video: HTMLVideoElement): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Blob();
    ctx.drawImage(video, 0, 0);
    const overlay = overlayCanvasRef.current;
    if (overlay) ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>(resolve =>
      canvas.toBlob(b => resolve(b ?? new Blob()), 'image/jpeg', 0.8)
    );
  };

  /** Stop recording, assemble the event, and persist it. */
  const closeEventWindow = async (video: HTMLVideoElement): Promise<void> => {
    if (!eventActiveRef.current) return;
    eventActiveRef.current = false;

    if (eventFrameTimerRef.current)  { clearInterval(eventFrameTimerRef.current);  eventFrameTimerRef.current  = null; }
    if (eventWindowTimerRef.current) { clearTimeout(eventWindowTimerRef.current);  eventWindowTimerRef.current = null; }
    cancelAnimationFrame(eventAnimIdRef.current);

    // Capture one final frame
    try {
      const last = await captureCurrentFrame(video);
      if (last.size > 0) eventFramesRef.current.push(last);
    } catch { /* ignore */ }

    const detections  = eventDetectionsRef.current;
    const frames      = [...eventFramesRef.current];
    const mimeType    = eventRecorderRef.current?.mimeType ?? 'video/webm';
    const eventType   = detections.some(d => d.className === 'person') ? 'alert' : 'detection';
    const maxConf     = detections.length ? Math.max(...detections.map(d => d.score)) : 0;
    const durationSec = Math.round((Date.now() - eventStartTimeRef.current) / 1000);
    const firstFrame  = frames[0] ?? new Blob();

    const persist = async (videoBlob: Blob) => {
      try {
        const saved = await localStorageService.saveEvent({
          timestamp:  new Date(eventStartTimeRef.current),
          type:       eventType as 'alert' | 'detection',
          detections,
          confidence: maxConf,
          imageBlob:  firstFrame,
          videoBlob,
          frames,
          metadata: {
            deviceId: navigator.userAgent,
            cameraId: 'main_camera',
            location: 'front_entrance',
            duration: durationSec,
          },
        });
        setRecordedEvents(prev => prev + 1);
        console.log(`📸 Event saved: ${saved.id} — ${frames.length} frames, ${durationSec}s, ${Math.round(videoBlob.size / 1024)}KB video`);
        if (navigator.onLine) syncQueueService.processSyncQueue();
      } catch (err) {
        console.error('Failed to save event:', err);
      }
    };

    const mr = eventRecorderRef.current;
    eventRecorderRef.current = null;
    if (mr && mr.state === 'recording') {
      mr.onstop = () => void persist(new Blob(eventChunksRef.current, { type: mimeType }));
      mr.stop();
    } else {
      void persist(new Blob(eventChunksRef.current, { type: mimeType }));
    }
  };

  /** (Re-)arm the 3-second close timer; calls closeEventWindow when it fires. */
  const scheduleWindowClose = (video: HTMLVideoElement): void => {
    if (eventWindowTimerRef.current) clearTimeout(eventWindowTimerRef.current);
    if (Date.now() - eventStartTimeRef.current >= 30_000) {
      void closeEventWindow(video); // hard cap at 30 s
      return;
    }
    eventWindowTimerRef.current = setTimeout(() => void closeEventWindow(video), 3_000);
  };

  /** Open a new event window: start recording + frame collection. */
  const openEventWindow = async (detections: YOLODetection[], video: HTMLVideoElement): Promise<void> => {
    if (eventActiveRef.current) return;
    eventActiveRef.current    = true;
    eventStartTimeRef.current = Date.now();
    eventFramesRef.current    = [];
    eventChunksRef.current    = [];
    eventDetectionsRef.current = detections;

    // First frame immediately
    const first = await captureCurrentFrame(video);
    if (first.size > 0) eventFramesRef.current.push(first);

    // Start MediaRecorder on a combined canvas (video + overlay)
    const overlay = overlayCanvasRef.current;
    if (overlay && video.videoWidth > 0) {
      try {
        const rc   = document.createElement('canvas');
        rc.width   = video.videoWidth;
        rc.height  = video.videoHeight;
        const rctx = rc.getContext('2d')!;
        const draw = () => {
          rctx.drawImage(video, 0, 0, rc.width, rc.height);
          rctx.drawImage(overlay, 0, 0, rc.width, rc.height);
          eventAnimIdRef.current = requestAnimationFrame(draw);
        };
        draw();
        const combined = rc.captureStream(30);
        const codecs   = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        let mr: MediaRecorder | null = null;
        for (const mime of codecs) {
          try { if (MediaRecorder.isTypeSupported(mime)) { mr = new MediaRecorder(combined, { mimeType: mime }); break; } }
          catch { /* try next */ }
        }
        if (!mr) mr = new MediaRecorder(combined);
        mr.ondataavailable = e => { if (e.data.size > 0) eventChunksRef.current.push(e.data); };
        mr.start(250);
        eventRecorderRef.current = mr;
      } catch (err) {
        console.warn('Video recording unavailable (frames only):', err);
      }
    }

    // Periodic frame capture (1 per second during the window)
    eventFrameTimerRef.current = setInterval(async () => {
      if (!eventActiveRef.current) return;
      const frame = await captureCurrentFrame(video);
      if (frame.size > 0) eventFramesRef.current.push(frame);
    }, 1_000);

    scheduleWindowClose(video);
  };

  const drawDetections = (detections: YOLODetection[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !videoRef.current) {
      return;
    }

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length === 0) {
      return;
    }

    detections.forEach((detection, index) => {
      const [x, y, width, height] = detection.bbox;
      
      // Convert normalized coordinates to pixel coordinates
      const pixelX = x * canvas.width;
      const pixelY = y * canvas.height;
      const pixelWidth = width * canvas.width;
      const pixelHeight = height * canvas.height;

      // Enhanced color coding for different object types
      let boxColor = '#00ff00'; // Default green
      let alertLevel = 'low';
      
      if (['person'].includes(detection.className)) {
        boxColor = '#ff4444'; // Red for people
        alertLevel = 'high';
      } else if (['car', 'truck', 'motorcycle', 'bicycle'].includes(detection.className)) {
        boxColor = '#ff8800'; // Orange for vehicles
        alertLevel = 'medium';
      } else if (['knife', 'scissors', 'bottle'].includes(detection.className)) {
        boxColor = '#ff0000'; // Bright red for potential weapons
        alertLevel = 'critical';
      }

      const confidence = Math.round(detection.score * 100);

      console.log(`🎨 Drawing ${detection.className} box at (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)}) size ${pixelWidth.toFixed(1)}x${pixelHeight.toFixed(1)} color ${boxColor}`);

      // Draw bounding box with thicker border for high priority objects
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = alertLevel === 'critical' ? 4 : alertLevel === 'high' ? 3 : 2;
      ctx.strokeRect(pixelX, pixelY, pixelWidth, pixelHeight);

      // Draw corner markers for better visibility
      const cornerSize = 15;
      ctx.fillStyle = boxColor;
      // Top-left corner
      ctx.fillRect(pixelX - 2, pixelY - 2, cornerSize, 4);
      ctx.fillRect(pixelX - 2, pixelY - 2, 4, cornerSize);
      // Top-right corner
      ctx.fillRect(pixelX + pixelWidth - cornerSize + 2, pixelY - 2, cornerSize, 4);
      ctx.fillRect(pixelX + pixelWidth - 2, pixelY - 2, 4, cornerSize);
      // Bottom-left corner
      ctx.fillRect(pixelX - 2, pixelY + pixelHeight - 2, cornerSize, 4);
      ctx.fillRect(pixelX - 2, pixelY + pixelHeight - cornerSize + 2, 4, cornerSize);
      // Bottom-right corner
      ctx.fillRect(pixelX + pixelWidth - cornerSize + 2, pixelY + pixelHeight - 2, cornerSize, 4);
      ctx.fillRect(pixelX + pixelWidth - 2, pixelY + pixelHeight - cornerSize + 2, 4, cornerSize);

      // Enhanced label with position info
      const position = `${Math.round(pixelX)},${Math.round(pixelY)}`;
      const label = `${detection.className.toUpperCase()} ${confidence}%`;
      const positionLabel = `@(${position})`;
      
      // Main label
      ctx.font = 'bold 16px Arial';
      const textMetrics = ctx.measureText(label);
      const labelHeight = 22;
      
      // Position label  
      ctx.font = '12px Arial';
      const posMetrics = ctx.measureText(positionLabel);
      const maxWidth = Math.max(textMetrics.width, posMetrics.width);
      
      // Draw label background with rounded corners effect
      ctx.fillStyle = boxColor + 'DD'; // Semi-transparent
      ctx.fillRect(pixelX - 2, pixelY - labelHeight - 18, maxWidth + 12, labelHeight + 16);
      
      // Draw main label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(label, pixelX + 3, pixelY - 8);
      
      // Draw position text
      ctx.font = '12px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(positionLabel, pixelX + 3, pixelY - 20);

      // Add detection ID for tracking
      ctx.font = '10px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`#${index + 1}`, pixelX + pixelWidth - 20, pixelY + 15);
    });
  };

  return (
    <div className="relative w-full h-full">
      {/* Video Stream Container */}
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Detection Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}
        />

        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Loading overlay */}
      {isModelLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-20">
          <div className="text-white text-center p-6" style={{background:'#111', border:'1px solid rgba(0,255,255,0.2)', borderRadius:12}}>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{borderColor:'#00ffff'}}></div>
            <p className="font-semibold" style={{color:'#00ffff'}}>Loading AI Model...</p>
            <p className="text-sm opacity-60 mt-1">First load may take a moment</p>
          </div>
        </div>
      )}

      {/* Requesting camera overlay */}
      {requestingCamera && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{background:'rgba(0,0,0,0.92)'}}>
          <div className="text-center p-8">
            <div className="animate-pulse text-6xl mb-4">📷</div>
            <p className="text-lg font-bold mb-2" style={{color:'#00ffff'}}>Requesting Camera Access</p>
            <p className="text-sm" style={{color:'rgba(255,255,255,0.5)'}}>Check your browser for a permission prompt</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{background:'rgba(0,0,0,0.95)'}}>
          <div className="text-center p-6 max-w-sm mx-4" style={{background:'#1a0000', border:'1px solid #ff4444', borderRadius:12}}>
            <p className="text-4xl mb-3">⚠️</p>
            <p className="font-bold mb-2" style={{color:'#ff4444'}}>Camera Error</p>
            <p className="text-sm mb-5" style={{color:'rgba(255,255,255,0.7)'}}>{error}</p>
            <button
              onClick={() => { setError(''); window.location.reload(); }}
              className="px-6 py-2 rounded-lg font-semibold"
              style={{background:'#00ffff', color:'#000'}}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Live detection panel */}
      {currentDetections.length > 0 && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-80 backdrop-blur-sm rounded-lg p-4 max-w-xs z-30">
          <div className="text-sm font-medium text-white mb-2 flex items-center">
            🎯 Live Detections ({currentDetections.length})
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {currentDetections.map((detection, idx) => {
              const confidence = Math.round(detection.score * 100);
              const [x, y, w, h] = detection.bbox;
              const pixelX = Math.round(x * (videoRef.current?.videoWidth || 640));
              const pixelY = Math.round(y * (videoRef.current?.videoHeight || 480));
              
              let alertColor = 'text-green-400';
              let alertIcon = '🟢';
              
              if (['person'].includes(detection.className)) {
                alertColor = 'text-red-400';
                alertIcon = '🔴';
              } else if (['car', 'truck', 'motorcycle', 'bicycle'].includes(detection.className)) {
                alertColor = 'text-orange-400';
                alertIcon = '🟠';
              } else if (['knife', 'scissors', 'bottle'].includes(detection.className)) {
                alertColor = 'text-red-500';
                alertIcon = '⚠️';
              }
              
              return (
                <div key={idx} className="text-xs border-l-2 border-gray-600 pl-2">
                  <div className="flex items-center space-x-1 mb-1">
                    <span>{alertIcon}</span>
                    <span className={`font-medium ${alertColor}`}>
                      {detection.className.toUpperCase()}
                    </span>
                    <span className="text-green-300">{confidence}%</span>
                  </div>
                  <div className="text-gray-400 text-xs">
                    📍 Position: ({pixelX}, {pixelY})
                  </div>
                  <div className="text-gray-400 text-xs">
                    📏 Size: {Math.round(w * (videoRef.current?.videoWidth || 640))}×{Math.round(h * (videoRef.current?.videoHeight || 480))}px
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status indicators — only show when camera stream is running */}
      {stream && (
        <div className="absolute top-4 left-4 flex flex-col space-y-2 z-30">
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          stream ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          📹 {stream ? 'Camera Active' : 'Camera Inactive'}
        </div>
        
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          modelBackend !== 'none' && !isModelLoading
            ? modelBackend === 'yolov8' ? 'bg-purple-600 text-white' : 'bg-blue-500 text-white'
            : 'bg-yellow-500 text-black'
        }`}>
          🤖 {isModelLoading
            ? 'AI Loading'
            : modelBackend === 'yolov8'
              ? 'YOLOv8 PRO'
              : modelBackend === 'coco-ssd'
                ? 'COCO-SSD'
                : 'AI Loading'}
        </div>

        {currentDetections.length > 0 && (
          <div className="bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-medium">
            🎯 {currentDetections.length} object{currentDetections.length !== 1 ? 's' : ''}
          </div>
        )}

        {recordedEvents > 0 && (
          <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-medium">
            💾 {recordedEvents} saved
          </div>
        )}
      </div>
      )}

      {/* FPS and performance info — only show when camera is active */}
      {stream && (
        <div className="absolute top-4 right-4 z-30 flex flex-col space-y-1 items-end">
          {isMobile && (
            <button
              type="button"
              onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}
              className="bg-black bg-opacity-55 border border-white border-opacity-20 rounded-lg px-2.5 py-1.5 text-white text-xl cursor-pointer leading-none"
            >
              🔄
            </button>
          )}
          <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-xs">
            Detection: {currentDetections.length > 0 ? 'Active' : 'Monitoring'}
          </div>
          <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-xs">
            Storage: Local + Cloud Sync
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraStream;