import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import type VideoPrivacyPipeline from './VideoPrivacyPipeline';

export type CameraType = 'thermal' | 'visual';

export interface RawFrame {
  cameraType: CameraType;
  width: number;
  height: number;
  /** Raw frame payload (expected RGBA or encoded H.264 Annex B). */
  data: Buffer;
  /** Epoch ms */
  timestamp: number;
}

export type CompositeMode = 'picture-in-picture' | 'split-screen';

export interface VideoStreamHandlerOptions {
  wsPath?: string;
  maxBufferMs?: number;
  storageDir?: string;
  compositeMode?: CompositeMode;
  keyframeIntervalMs?: number;
  targetBitrateMobile?: number;
  targetBitrateDesktop?: number;
  droneId?: string;
  privacyPipeline?: VideoPrivacyPipeline;
  onDetections?: (payload: { timestamp: number; detections: any[] }) => Promise<void> | void;
}

interface BufferedFrame extends RawFrame {
  encoded: Buffer;
}

export class VideoStreamHandler {
  private wss: WebSocketServer | null = null;
  private readonly wsPath: string;
  private readonly maxBufferMs: number;
  private readonly storageDir: string;
  private readonly compositeMode: CompositeMode;
  private readonly keyframeIntervalMs: number;
  private readonly targetBitrateMobile: number;
  private readonly targetBitrateDesktop: number;
  private readonly droneId: string;
  private readonly privacyPipeline?: VideoPrivacyPipeline;
  private readonly onDetections?: (payload: { timestamp: number; detections: any[] }) => Promise<void> | void;
  private buffer: BufferedFrame[] = [];
  private lastKeyframeAt = 0;
  private recordStream: fs.WriteStream | null = null;
  private encryptedRecordStream: fs.WriteStream | null = null;

  constructor(options: VideoStreamHandlerOptions = {}) {
    this.wsPath = options.wsPath ?? '/ws/video';
    this.maxBufferMs = options.maxBufferMs ?? 4000;
    
    // Sanitize storage directory to prevent path traversal
    const baseDir = path.resolve(process.cwd());
    const requestedDir = options.storageDir ?? path.join(baseDir, 'data');
    const resolvedDir = path.resolve(baseDir, requestedDir);
    
    // Ensure the resolved path is within the base directory using relative path check
    const relativePath = path.relative(baseDir, resolvedDir);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Invalid storage directory: path traversal detected');
    }
    this.storageDir = resolvedDir;
    
    this.compositeMode = options.compositeMode ?? 'picture-in-picture';
    this.keyframeIntervalMs = options.keyframeIntervalMs ?? 2000;
    this.targetBitrateMobile = options.targetBitrateMobile ?? 1_200_000; // ~1.2 Mbps
    this.targetBitrateDesktop = options.targetBitrateDesktop ?? 4_000_000; // ~4 Mbps
    this.droneId = options.droneId ?? 'drone-unknown';
    this.privacyPipeline = options.privacyPipeline;
    this.onDetections = options.onDetections;
  }

  /** Attach to existing HTTP/S server to serve multiple viewers. */
  attach(server: any) {
    this.wss = new WebSocketServer({ server, path: this.wsPath });
    this.wss.on('connection', (socket: WebSocket, req) => {
      const ua = req.headers['user-agent'] || '';
      const mobile = /mobile|iphone|android|ipad/i.test(String(ua));
      const targetBitrate = mobile ? this.targetBitrateMobile : this.targetBitrateDesktop;
      socket.send(JSON.stringify({ type: 'hello', targetBitrate, compositeMode: this.compositeMode }));
      socket.on('error', () => socket.close());
    });
  }

  /** Handle an incoming raw frame from the drone. */
  async handleFrame(frame: RawFrame): Promise<void> {
    const pipeline = this.privacyPipeline;
    if (frame.cameraType === 'visual' && pipeline) {
      const processed = await this.processVisualFrame(frame, pipeline);
      if (processed) {
        frame = processed.visualFrame;
        // Optionally emit detections downstream
        if (processed.detections.length && this.onDetections) {
          this.onDetections({ timestamp: frame.timestamp, detections: processed.detections });
        }
      }
    }

    const now = Date.now();
    const needsKeyframe = now - this.lastKeyframeAt > this.keyframeIntervalMs;
    const encoded = await this.encodeToH264(frame, needsKeyframe);
    if (needsKeyframe) this.lastKeyframeAt = now;

    const buffered: BufferedFrame = { ...frame, encoded };
    this.buffer.push(buffered);
    this.pruneBuffer(frame.timestamp);

    // Broadcast to all viewers
    this.broadcast(buffered);

    // Persist frame for recording (simple NDJSON of base64 payloads; replace with real muxer when available)
    await this.recordFrame(buffered);
  }

  /** Apply privacy pipeline to visual frames and produce filtered + encrypted outputs. */
  private async processVisualFrame(frame: RawFrame, pipeline: VideoPrivacyPipeline): Promise<{
    visualFrame: RawFrame;
    detections: any[];
  } | null> {
    // OffscreenCanvas is not available in all runtimes; skip if missing
    const OffscreenCanvasCtor = (globalThis as any).OffscreenCanvas;
    if (!OffscreenCanvasCtor) {
      return null;
    }

    // Assume RGBA input; convert Buffer -> Uint8ClampedArray
    const rgba = new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    const result = await pipeline.process({
      width: frame.width,
      height: frame.height,
      data: rgba,
      timestamp: frame.timestamp,
      droneId: this.droneId
    });

    const filteredBuffer = Buffer.from(result.filteredFrame.buffer, result.filteredFrame.byteOffset, result.filteredFrame.byteLength);

    // Replace frame data with privacy-filtered version for broadcast/record
    const visualFrame: RawFrame = {
      ...frame,
      data: filteredBuffer
    };

    // Persist encrypted full-quality alongside if available
    if (result.encryptedFullQuality) {
      this.appendEncryptedFullQuality(frame.timestamp, result.encryptedFullQuality);
    }

    return { visualFrame, detections: result.detections };
  }

  /** Drops frames outside buffer window. */
  private pruneBuffer(latestTs: number) {
    const minTs = latestTs - this.maxBufferMs;
    this.buffer = this.buffer.filter(f => f.timestamp >= minTs);
  }

  /** Broadcast encoded frame with lightweight metadata. */
  private broadcast(frame: BufferedFrame) {
    if (!this.wss) return;
    const payload = JSON.stringify({
      type: 'frame',
      cameraType: frame.cameraType,
      width: frame.width,
      height: frame.height,
      timestamp: frame.timestamp,
      compositeMode: this.compositeMode,
      data: frame.encoded.toString('base64')
    });

    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /** Minimal placeholder encoder; swap with hardware/ffmpeg pipeline. */
  private async encodeToH264(frame: RawFrame, forceKeyframe: boolean): Promise<Buffer> {
    // In production, call into ffmpeg/libx264 or hardware encoder, honoring bitrate & keyframe flags.
    // Here we return the raw data as a stub to keep the pipeline non-blocking.
    void forceKeyframe;
    return frame.data;
  }

  /** Compose thermal + visual; currently passthrough visual with metadata flag. Extend with real compositor. */
  public compose(visual: RawFrame, thermal: RawFrame): RawFrame {
    // Placeholder: return visual frame with thermal metadata; real implementation should GPU-compose.
    const pipMeta = Buffer.from(JSON.stringify({ pip: { source: 'thermal', w: thermal.width, h: thermal.height } }));
    return {
      cameraType: 'visual',
      width: visual.width,
      height: visual.height,
      data: Buffer.concat([visual.data, pipMeta]),
      timestamp: visual.timestamp
    };
  }

  /** Begin recording session (JSONL stub). */
  public startRecording(): void {
    if (this.recordStream) return;
    
    // Create storage directory safely
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(this.storageDir, { recursive: true });
    
    // Generate safe file paths with timestamp
    const timestamp = Date.now();
    const fileName = `flight-${timestamp}.jsonl`;
    const encFileName = `flight-${timestamp}-encrypted.bin`;
    
    // Resolve and validate file paths to prevent traversal using relative path check
    const filePath = path.resolve(this.storageDir, fileName);
    const encPath = path.resolve(this.storageDir, encFileName);
    
    // Ensure paths are within storage directory by checking relative paths
    const relativeFilePath = path.relative(this.storageDir, filePath);
    const relativeEncPath = path.relative(this.storageDir, encPath);
    
    if (relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath) ||
        relativeEncPath.startsWith('..') || path.isAbsolute(relativeEncPath)) {
      throw new Error('Invalid file path: attempted path traversal');
    }
    
    // Paths have been validated against path traversal above
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    this.recordStream = fs.createWriteStream(filePath, { flags: 'a' });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    this.encryptedRecordStream = fs.createWriteStream(encPath, { flags: 'a' });
  }

  /** Stop recording. */
  public stopRecording(): void {
    if (this.recordStream) {
      this.recordStream.end();
      this.recordStream = null;
    }
    if (this.encryptedRecordStream) {
      this.encryptedRecordStream.end();
      this.encryptedRecordStream = null;
    }
  }

  private async recordFrame(frame: BufferedFrame): Promise<void> {
    if (!this.recordStream) return;
    const line = JSON.stringify({
      ts: frame.timestamp,
      cameraType: frame.cameraType,
      w: frame.width,
      h: frame.height,
      data: frame.encoded.toString('base64')
    });
    return new Promise<void>((resolve, reject) => {
      this.recordStream!.write(line + '\n', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private appendEncryptedFullQuality(ts: number, encrypted: Uint8Array): void {
    if (!this.encryptedRecordStream) return;
    const header = Buffer.alloc(8);
    header.writeBigInt64BE(BigInt(ts));
    this.encryptedRecordStream.write(header);
    this.encryptedRecordStream.write(Buffer.from(encrypted));
  }
}

export default VideoStreamHandler;
