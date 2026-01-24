import { useEffect, useRef, useState } from 'react';
import YOLOModel, { YOLODetection } from '../utils/yolo';
import localStorageService from '../utils/storage';

export interface StreamFrame {
  timestamp: number;
  data: string; // base64-encoded image data (visual or thermal)
  width: number;
  height: number;
  cameraType: 'visual' | 'thermal';
  thermalData?: {
    minTemperature: number;
    maxTemperature: number;
    avgTemperature: number;
  };
}

interface UseDroneStreamOptions {
  wsUrl?: string;
  detectionEveryNFrames?: number;
  detectionScoreThreshold?: number;
}

export function useDroneStream(options: UseDroneStreamOptions = {}) {
  const {
    wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/drone`,
    detectionEveryNFrames = 5,
    detectionScoreThreshold = 0.4
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestFrame, setLatestFrame] = useState<StreamFrame | null>(null);
  const [detections, setDetections] = useState<YOLODetection[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const modelRef = useRef<YOLOModel | null>(null);
  const frameCountRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = (evt) => {
      console.error('WS error', evt);
      setError('WebSocket error');
    };

    ws.onmessage = async (message) => {
      try {
        const parsed = JSON.parse(message.data as string);
        if (parsed.type === 'frame' && parsed.frame) {
          const frame: StreamFrame = parsed.frame;
          setLatestFrame(frame);
          frameCountRef.current += 1;

          if (frameCountRef.current % detectionEveryNFrames === 0) {
            await runDetection(frame, detectionScoreThreshold, setDetections, modelRef, canvasRef);
          }
        }
      } catch (err) {
        console.error('WS message parse error', err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [wsUrl, detectionEveryNFrames, detectionScoreThreshold]);

  return { isConnected, error, latestFrame, detections };
}

async function runDetection(
  frame: StreamFrame,
  threshold: number,
  setDetections: (dets: YOLODetection[]) => void,
  modelRef: React.MutableRefObject<YOLOModel | null>,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
): Promise<void> {
  try {
    if (!modelRef.current) {
      modelRef.current = new YOLOModel();
      await modelRef.current.loadModel();
    }

    const img = await dataUrlToImage(`data:image/jpeg;base64,${frame.data}`);
    const canvas = ensureCanvas(canvasRef, frame.width, frame.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, frame.width, frame.height);
    const detections = await modelRef.current.detect(canvas);
    const filtered = detections.filter(d => d.score >= threshold);
    setDetections(filtered);

    if (filtered.length) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
      if (blob) {
        await localStorageService.saveEvent({
          timestamp: new Date(),
          type: 'detection',
          detections: filtered,
          confidence: Math.max(...filtered.map(d => d.score)),
          imageBlob: blob,
          metadata: {
            deviceId: 'drone',
            cameraId: frame.cameraType,
            location: 'in-flight'
          }
        });
      }
    }
  } catch (error) {
    console.error('Detection pipeline error', error);
  }
}

function ensureCanvas(
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
  width: number,
  height: number
): HTMLCanvasElement {
  if (!canvasRef.current) {
    canvasRef.current = document.createElement('canvas');
  }
  const canvas = canvasRef.current;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.8): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export default useDroneStream;
