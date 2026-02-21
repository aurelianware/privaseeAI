import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import YOLOModel, { YOLODetection } from '../utils/yolo';
import localStorageService, { SecurityEvent } from '../utils/storage';
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
}

const CameraStream: React.FC<CameraStreamProps> = ({ onDetection, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const yoloModelRef = useRef<YOLOModel | null>(null);
  const detectionLoopRef = useRef<number | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [requestingCamera, setRequestingCamera] = useState(false);
  const [currentDetections, setCurrentDetections] = useState<YOLODetection[]>([]);
  const [lastEventTime, setLastEventTime] = useState<number>(0);
  const [recordedEvents, setRecordedEvents] = useState<number>(0);

  // Initialize TensorFlow.js and load YOLO model
  useEffect(() => {
    const initializeYOLO = async () => {
      try {
        setIsModelLoading(true);
        
        // Initialize TensorFlow.js backend
        await tf.ready();
        console.log('TensorFlow.js backend:', tf.getBackend());

        // Initialize YOLO model (now using COCO-SSD)
        yoloModelRef.current = new YOLOModel();
        
        // Load COCO-SSD model (no URL needed)
        console.log('Loading COCO-SSD model...');
        const modelLoaded = await yoloModelRef.current.loadModel();
        
        if (!modelLoaded) {
          throw new Error('Failed to load COCO-SSD model');
        }
        
        console.log('✅ COCO-SSD model loaded successfully');

        setIsModelLoading(false);
        
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
    if (!isActive) return;

    const startCamera = async () => {
      setRequestingCamera(true);
      setError('');
      try {
        // Try ideal constraints first, fall back to basic video if they fail
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
        } catch {
          // Ultra-simple fallback
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        setStream(mediaStream);
        setRequestingCamera(false);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
          videoRef.current.onloadedmetadata = () => {
            startDetectionLoop();
          };
          // If metadata already loaded, start immediately
          if (videoRef.current.readyState >= 2) {
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
      // Cleanup camera stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, [isActive]);

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

        console.log(`🔍 Detection results: ${detections.length} objects found`);
        if (detections.length > 0) {
          detections.forEach((det, i) => {
            console.log(`  ${i+1}. ${det.className} (${(det.score * 100).toFixed(1)}%) at [${det.bbox.map(n => n.toFixed(3)).join(', ')}]`);
          });
        }

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

        // Save significant events to local storage (now overlay is ready for video recording)
        await saveDetectionEvent(detections, video);

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

  // Save detection event to local storage
  const saveDetectionEvent = async (detections: YOLODetection[], video: HTMLVideoElement): Promise<void> => {
    // Only save if there are detections (lowered threshold for better event capture)
    const significantDetections = detections.filter(d => 
      d.score > 0.5 || // Lowered confidence threshold
      ['person', 'car', 'truck', 'motorcycle', 'bus', 'bicycle', 'dog', 'cat'].includes(d.className) // More object types
    );

    if (significantDetections.length === 0) return;

    // Rate limiting: don't save events too frequently (reduced to 3 seconds)
    const now = Date.now();
    if (now - lastEventTime < 3000) return; // Wait 3 seconds between events

    try {
      console.log('🎬 Starting media capture for detection event...');
      
      // Start video recording for this event (with better error handling)
      let videoBlob: Blob;
      try {
        videoBlob = await startVideoRecording(3000); // Record 3 seconds
      } catch (videoError) {
        console.warn('⚠️ Video recording failed, saving event with image only:', videoError);
        videoBlob = new Blob(); // Empty blob as fallback
      }

      // Capture current frame as image WITH detection overlay
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Draw the video frame
        ctx.drawImage(video, 0, 0);
        
        // Draw detection overlays on the saved image
        drawDetectionsOnCanvas(significantDetections, canvas, ctx);
        
        // Convert to blob
        const imageBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            console.log('🖼️ Image blob created:', blob?.size || 0, 'bytes');
            resolve(blob || new Blob());
          }, 'image/jpeg', 0.8);
        });

        console.log('📷 Image captured with overlay, size:', imageBlob.size, 'bytes');

        // Create security event
        const eventType = significantDetections.some(d => d.className === 'person') ? 'alert' : 'detection';
        const maxConfidence = Math.max(...significantDetections.map(d => d.score));

        const securityEvent: Omit<SecurityEvent, 'id' | 'synced' | 'syncAttempts'> = {
          timestamp: new Date(),
          type: eventType,
          detections: significantDetections,
          confidence: maxConfidence,
          imageBlob,
          videoBlob, // Now includes video
          metadata: {
            deviceId: navigator.userAgent,
            cameraId: 'main_camera',
            location: 'front_entrance',
            duration: 3 // 3 second video
          },
        };

        // Save to local storage
        const savedEvent = await localStorageService.saveEvent(securityEvent);
        
        console.log('🔍 DEBUG: Event being saved:', {
          id: savedEvent.id,
          hasImageBlob: !!securityEvent.imageBlob,
          hasVideoBlob: !!securityEvent.videoBlob,
          imageBlobSize: securityEvent.imageBlob?.size || 0,
          videoBlobSize: securityEvent.videoBlob?.size || 0
        });
        
        // Update state
        setLastEventTime(now);
        setRecordedEvents(prev => prev + 1);
        
        console.log(`📸🎥 Security event saved with media: ${savedEvent.id} (${eventType})`);
        console.log(`📊 Image size: ${Math.round(imageBlob.size / 1024)}KB, Video size: ${Math.round(videoBlob.size / 1024)}KB`);

        // Trigger sync if online
        if (navigator.onLine) {
          syncQueueService.processSyncQueue();
        }
      }
    } catch (error) {
      console.error('Failed to save detection event:', error);
    }
  };

  // Enhanced video recording function that captures overlay
  const startVideoRecording = async (durationMs: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      // Get current stream from video element
      const currentStream = videoRef.current?.srcObject as MediaStream;
      const overlayCanvas = overlayCanvasRef.current;
      const video = videoRef.current;
      
      // Check if stream is available
      if (!currentStream || currentStream.getTracks().length === 0 || !overlayCanvas || !video) {
        reject(new Error('No video stream or overlay canvas available'));
        return;
      }

      // Check if video track is active
      const videoTrack = currentStream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        reject(new Error('Video track not ready'));
        return;
      }

      try {
        recordedChunksRef.current = [];
        
        // Create a canvas to combine video + overlay
        const recordingCanvas = document.createElement('canvas');
        recordingCanvas.width = video.videoWidth;
        recordingCanvas.height = video.videoHeight;
        const recordingCtx = recordingCanvas.getContext('2d');
        
        if (!recordingCtx) {
          reject(new Error('Could not create recording canvas context'));
          return;
        }

        // Get stream from the combined canvas
        const combinedStream = recordingCanvas.captureStream(30); // 30 FPS
        
        // Function to draw video + overlay onto recording canvas
        let animationId: number;
        const drawFrame = () => {
          // Draw the video frame
          recordingCtx.drawImage(video, 0, 0, recordingCanvas.width, recordingCanvas.height);
          
          // Draw the overlay on top - check if overlay has content
          const overlayImageData = overlayCanvas.getContext('2d')?.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
          const hasOverlayContent = overlayImageData && overlayImageData.data.some((pixel, i) => i % 4 === 3 && pixel > 0); // Check alpha channel
          
          if (hasOverlayContent) {
            console.log('📹 Recording frame with overlay content');
          }
          
          recordingCtx.drawImage(overlayCanvas, 0, 0, recordingCanvas.width, recordingCanvas.height);
          
          // Continue drawing frames during recording
          animationId = requestAnimationFrame(drawFrame);
        };
        
        // Start drawing frames
        drawFrame();

        // Try different codecs for better compatibility
        let mediaRecorder: MediaRecorder;
        const options = [
          { mimeType: 'video/webm;codecs=vp9' },
          { mimeType: 'video/webm;codecs=vp8' },
          { mimeType: 'video/webm' },
          { mimeType: 'video/mp4' }
        ];

        let recorderCreated = false;
        for (const option of options) {
          try {
            if (MediaRecorder.isTypeSupported(option.mimeType)) {
              mediaRecorder = new MediaRecorder(combinedStream, option);
              console.log(`📹 Using codec for overlay recording: ${option.mimeType}`);
              recorderCreated = true;
              break;
            }
          } catch (codecError) {
            console.warn(`⚠️ Codec ${option.mimeType} not supported`);
          }
        }

        if (!recorderCreated) {
          // Fallback to default
          mediaRecorder = new MediaRecorder(combinedStream);
          console.log('📹 Using default MediaRecorder settings for overlay recording');
        }
        
        mediaRecorderRef.current = mediaRecorder!;

        // Collect video data
        mediaRecorder!.ondataavailable = (event) => {
          console.log(`📊 Recording chunk with overlay: ${event.data.size} bytes`);
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        // When recording stops, create blob and cleanup
        mediaRecorder!.onstop = () => {
          const videoBlob = new Blob(recordedChunksRef.current, { 
            type: mediaRecorder!.mimeType || 'video/webm' 
          });
          console.log(`🎥 Overlay recording completed: ${videoBlob.size} bytes`);
          
          // Stop drawing frames
          cancelAnimationFrame(animationId);
          
          resolve(videoBlob);
        };

        mediaRecorder!.onerror = (event) => {
          console.error('MediaRecorder error:', event);
          cancelAnimationFrame(animationId);
          reject(new Error('Recording failed'));
        };

        // Start recording
        mediaRecorder!.start(250); // Collect data every 250ms for better reliability
        
        console.log(`🎥 Started ${durationMs}ms overlay video recording...`);

        // Stop recording after specified duration
        setTimeout(() => {
          if (mediaRecorder!.state === 'recording') {
            console.log('🎥 Video recording completed');
            mediaRecorder!.stop();
          }
        }, durationMs);

      } catch (error) {
        console.error('Failed to start video recording:', error);
        reject(error);
      }
    });
  };

  // Function to draw detections on any canvas (for saved images/videos)
  const drawDetectionsOnCanvas = (detections: YOLODetection[], canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
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

      // Draw bounding box with thicker border for high priority objects
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = alertLevel === 'critical' ? 6 : alertLevel === 'high' ? 4 : 3; // Thicker for saved media
      ctx.strokeRect(pixelX, pixelY, pixelWidth, pixelHeight);

      // Draw filled corner markers for better visibility in saved media
      const cornerSize = 20;
      ctx.fillStyle = boxColor;
      // Top-left corner
      ctx.fillRect(pixelX - 3, pixelY - 3, cornerSize, 6);
      ctx.fillRect(pixelX - 3, pixelY - 3, 6, cornerSize);
      // Top-right corner
      ctx.fillRect(pixelX + pixelWidth - cornerSize + 3, pixelY - 3, cornerSize, 6);
      ctx.fillRect(pixelX + pixelWidth - 3, pixelY - 3, 6, cornerSize);

      // Enhanced label with bigger text for saved media
      const position = `${Math.round(pixelX)},${Math.round(pixelY)}`;
      const label = `${detection.className.toUpperCase()} ${confidence}%`;
      const positionLabel = `@(${position})`;
      const timestamp = new Date().toLocaleTimeString();
      
      // Calculate label dimensions
      ctx.font = 'bold 20px Arial';
      const textMetrics = ctx.measureText(label);
      ctx.font = '14px Arial';
      const posMetrics = ctx.measureText(positionLabel);
      const timeMetrics = ctx.measureText(timestamp);
      const maxWidth = Math.max(textMetrics.width, posMetrics.width, timeMetrics.width);
      
      // Draw label background with semi-transparent black background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(pixelX - 5, pixelY - 55, maxWidth + 20, 50);
      
      // Draw colored border around label
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(pixelX - 5, pixelY - 55, maxWidth + 20, 50);
      
      // Draw main label text
      ctx.fillStyle = boxColor;
      ctx.font = 'bold 20px Arial';
      ctx.fillText(label, pixelX + 5, pixelY - 30);
      
      // Draw position text
      ctx.font = '14px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(positionLabel, pixelX + 5, pixelY - 15);
      
      // Draw timestamp
      ctx.fillText(timestamp, pixelX + 5, pixelY - 5);

      // Add detection ID in top-right of box
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = boxColor;
      ctx.fillText(`#${index + 1}`, pixelX + pixelWidth - 30, pixelY + 20);
    });
  };

  const drawDetections = (detections: YOLODetection[], canvas: HTMLCanvasElement) => {
    console.log(`🎨 drawDetections called with ${detections.length} detections, canvas size: ${canvas.width}x${canvas.height}`);
    
    const ctx = canvas.getContext('2d');
    if (!ctx || !videoRef.current) {
      console.log('❌ No canvas context or video ref');
      return;
    }

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length === 0) {
      console.log('ℹ️ No detections to draw');
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

      {/* Status indicators */}
      <div className="absolute top-4 left-4 flex flex-col space-y-2 z-30">
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          stream ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          📹 {stream ? 'Camera Active' : 'Camera Inactive'}
        </div>
        
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          yoloModelRef.current && !isModelLoading ? 'bg-blue-500 text-white' : 'bg-yellow-500 text-black'
        }`}>
          🤖 {yoloModelRef.current && !isModelLoading ? 'AI Ready' : 'AI Loading'}
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

      {/* FPS and performance info */}
      <div className="absolute top-4 right-4 z-30 flex flex-col space-y-1">
        <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-xs">
          Detection: {currentDetections.length > 0 ? 'Active' : 'Monitoring'}
        </div>
        
        <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-xs">
          Storage: Local + Cloud Sync
        </div>
      </div>
    </div>
  );
};

export default CameraStream;