export interface VisualFrame {
  width: number;
  height: number;
  /** RGBA pixel buffer (Uint8ClampedArray length = width * height * 4) */
  data: Uint8ClampedArray;
  /** Epoch ms */
  timestamp: number;
  droneId: string;
}

export interface PrivacyZone {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  w: number; // 0-1 normalized
  h: number; // 0-1 normalized
}

export interface DetectionBox {
  x: number; // 0-1
  y: number; // 0-1
  w: number; // 0-1
  h: number; // 0-1
  score: number;
  label: 'face' | 'plate' | 'other';
}

export interface ProcessingConfig {
  enableFaceBlur?: boolean;
  enablePlateBlur?: boolean;
  privacyZones?: PrivacyZone[];
  watermark?: boolean;
  blurRadius?: number;
  // Hooks for optimized models (TFLite/ONNX) provided externally
  runFaceDetection?: (frame: VisualFrame) => Promise<DetectionBox[]>;
  runPlateDetection?: (frame: VisualFrame) => Promise<DetectionBox[]>;
  encryptFullQuality?: (raw: Uint8ClampedArray, width: number, height: number) => Promise<Uint8Array>;
}

export interface ProcessedVideoResult {
  filteredFrame: Uint8ClampedArray; // privacy-filtered, shareable
  encryptedFullQuality?: Uint8Array; // optional encrypted original
  detections: DetectionBox[];
  timestamp: number;
}

export class VideoPrivacyPipeline {
  private cfg: Required<ProcessingConfig>;

  constructor(config: ProcessingConfig = {}) {
    this.cfg = {
      enableFaceBlur: config.enableFaceBlur ?? true,
      enablePlateBlur: config.enablePlateBlur ?? true,
      privacyZones: config.privacyZones ?? [],
      watermark: config.watermark ?? true,
      blurRadius: config.blurRadius ?? 8,
      runFaceDetection: config.runFaceDetection ?? defaultDetect,
      runPlateDetection: config.runPlateDetection ?? defaultDetect,
      encryptFullQuality: config.encryptFullQuality ?? defaultEncrypt
    };
  }

  /** Main entry: redact PII, honor privacy zones, watermark, and produce optional encrypted original. */
  public async process(frame: VisualFrame): Promise<ProcessedVideoResult> {
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    // Draw source - create new Uint8ClampedArray to ensure proper type
    const imageData = new ImageData(
      new Uint8ClampedArray(frame.data), 
      frame.width, 
      frame.height
    );
    ctx.putImageData(imageData, 0, 0);

    // Privacy zones: stop recording by blanking zones in filtered output
    this.applyPrivacyZones(ctx, frame.width, frame.height, this.cfg.privacyZones);

    // Detections (faces, plates)
    const [faces, plates] = await Promise.all([
      this.cfg.enableFaceBlur ? this.cfg.runFaceDetection(frame) : Promise.resolve([]),
      this.cfg.enablePlateBlur ? this.cfg.runPlateDetection(frame) : Promise.resolve([])
    ]);

    // Blur detected regions
    this.redactDetections(ctx, [...faces, ...plates], frame.width, frame.height);

    // Watermark for shareable output
    if (this.cfg.watermark) {
      this.drawWatermark(ctx, frame.width, frame.height, frame.droneId, frame.timestamp);
    }

    const filtered = ctx.getImageData(0, 0, frame.width, frame.height).data;

    // Encrypt full-quality original if requested
    const encryptedFullQuality = await this.cfg.encryptFullQuality(frame.data, frame.width, frame.height);

    return {
      filteredFrame: new Uint8ClampedArray(filtered),
      encryptedFullQuality,
      detections: [...faces, ...plates],
      timestamp: frame.timestamp
    };
  }

  private applyPrivacyZones(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, zones: PrivacyZone[]) {
    ctx.save();
    ctx.fillStyle = 'black';
    for (const z of zones) {
      ctx.fillRect(z.x * w, z.y * h, z.w * w, z.h * h);
    }
    ctx.restore();
  }

  private redactDetections(ctx: OffscreenCanvasRenderingContext2D, dets: DetectionBox[], w: number, h: number) {
    for (const det of dets) {
      const x = det.x * w;
      const y = det.y * h;
      const bw = det.w * w;
      const bh = det.h * h;
      this.blurRegion(ctx, x, y, bw, bh, this.cfg.blurRadius);
    }
  }

  private blurRegion(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
    // Simple stack blur approximation using canvas filter
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h);
    ctx.restore();
  }

  private drawWatermark(ctx: OffscreenCanvasRenderingContext2D, _w: number, h: number, droneId: string, ts: number) {
    const stamp = new Date(ts).toISOString();
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'white';
    ctx.font = '16px sans-serif';
    const text = `${droneId} | ${stamp}`;
    const metrics = ctx.measureText(text);
    const pad = 8;
    const boxW = metrics.width + pad * 2;
    const boxH = 24;
    ctx.fillRect(pad, h - boxH - pad, boxW, boxH);
    ctx.fillStyle = 'black';
    ctx.fillText(text, pad * 2 - 2, h - pad - 6);
    ctx.restore();
  }
}

// ======== Default stubs (replace with optimized TFLite/ONNX pipelines) ========
async function defaultDetect(): Promise<DetectionBox[]> {
  return [];
}

async function defaultEncrypt(raw: Uint8ClampedArray, _w: number, _h: number): Promise<Uint8Array> {
  // Stub: return original bytes; replace with AES-GCM or KMS-backed envelope
  return new Uint8Array(raw);
}

export default VideoPrivacyPipeline;
