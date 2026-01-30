export interface ThermalFrame {
  width: number;
  height: number;
  /** Flattened temperature map (row-major), degrees Celsius */
  temperatures: Float32Array | number[];
  /** Epoch milliseconds */
  timestamp: number;
  /** Current altitude AGL in meters */
  altitudeMeters: number;
  /** Camera focal length in millimeters */
  focalLengthMm: number;
}

export type ThermalClass = 'human' | 'animal' | 'vehicle' | 'hot-spot' | 'unknown';

export interface ThermalDetection {
  id: number;
  cls: ThermalClass;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number }; // normalized 0-1
  peakTemp: number;
  avgTemp: number;
  distanceMeters?: number;
  timestamp: number;
}

export interface ThermalAnalyzerConfig {
  ambientThresholdDelta?: number; // deg C above ambient to flag hot-spot
  humanMin?: number;
  humanMax?: number;
  minAreaPx?: number;
  maxAreaPx?: number;
  movementMaxDelta?: number; // px for track association
  logger?: (entry: Record<string, unknown>) => void | Promise<void>;
  runPrivaseeModel?: (frame: ThermalFrame) => Promise<ThermalDetection[]>;
}

interface TrackState {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lastTs: number;
}

export class ThermalAnalyzer {
  private cfg: Required<Omit<ThermalAnalyzerConfig, 'logger' | 'runPrivaseeModel'>>;
  private logger?: ThermalAnalyzerConfig['logger'];
  private runPrivaseeModel?: ThermalAnalyzerConfig['runPrivaseeModel'];
  private nextTrackId = 1;
  private tracks: TrackState[] = [];

  constructor(config: ThermalAnalyzerConfig = {}) {
    this.cfg = {
      ambientThresholdDelta: config.ambientThresholdDelta ?? 8,
      humanMin: config.humanMin ?? 35,
      humanMax: config.humanMax ?? 37.5,
      minAreaPx: config.minAreaPx ?? 25,
      maxAreaPx: config.maxAreaPx ?? 0.25 * 640 * 512,
      movementMaxDelta: config.movementMaxDelta ?? 32
    };
    this.logger = config.logger;
    this.runPrivaseeModel = config.runPrivaseeModel;
  }

  /** Process a thermal frame and return detections with tracking and distance estimates. */
  public async processFrame(frame: ThermalFrame): Promise<ThermalDetection[]> {
    const ambient = this.estimateAmbient(frame.temperatures);
    const threshold = ambient + this.cfg.ambientThresholdDelta;

    // Optional hook to external privasee model
    const modelDetections = this.runPrivaseeModel ? await this.runPrivaseeModel(frame) : [];

    const blobs = this.segmentHotBlobs(frame, threshold);
    const primaryDetections = blobs.map(blob => this.classifyBlob(blob, frame, ambient));

    const merged = [...primaryDetections, ...modelDetections];
    const tracked = this.track(merged, frame.timestamp);

    await this.logDetections(tracked, frame, ambient);
    return tracked;
  }

  private estimateAmbient(temps: Float32Array | number[]): number {
    // Use median to reduce hot-spot skew
    const values = Array.from(temps);
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    // eslint-disable-next-line security/detect-object-injection
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  }

  /** Simple connected-component over threshold using grid scan. */
  private segmentHotBlobs(frame: ThermalFrame, threshold: number) {
    const { width, height, temperatures } = frame;
    const tempArr = temperatures as number[];
    const visited = new Uint8Array(width * height);
    const blobs: Array<{ pixels: number[]; peak: number; sum: number }> = [];

    const idx = (x: number, y: number) => y * width + x;
    const neighbors = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x, y);
        // eslint-disable-next-line security/detect-object-injection
        if (visited[i]) continue;
        // eslint-disable-next-line security/detect-object-injection
        visited[i] = 1;
        // eslint-disable-next-line security/detect-object-injection
        const temp = tempArr[i];
        if (temp < threshold) continue;

        const stack = [i];
        const pixels: number[] = [];
        let peak = temp;
        let sum = 0;

        while (stack.length) {
          const p = stack.pop()!;
          const py = Math.floor(p / width);
          const px = p - py * width;
          // eslint-disable-next-line security/detect-object-injection
          const t = tempArr[p];
          if (t < threshold) continue;
          // eslint-disable-next-line security/detect-object-injection
          if (visited[p] === 2) continue;
          // eslint-disable-next-line security/detect-object-injection
          visited[p] = 2;
          pixels.push(p);
          sum += t;
          if (t > peak) peak = t;

          for (const [dx, dy] of neighbors) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = idx(nx, ny);
            // eslint-disable-next-line security/detect-object-injection
            if (visited[ni] === 2) continue;
            // eslint-disable-next-line security/detect-object-injection
            if (tempArr[ni] >= threshold) {
              stack.push(ni);
            }
          }
        }

        if (pixels.length >= this.cfg.minAreaPx && pixels.length <= this.cfg.maxAreaPx) {
          blobs.push({ pixels, peak, sum });
        }
      }
    }

    return blobs;
  }

  private classifyBlob(blob: { pixels: number[]; peak: number; sum: number }, frame: ThermalFrame, ambient: number): ThermalDetection {
    const { width, height, timestamp, altitudeMeters, focalLengthMm } = frame;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of blob.pixels) {
      ys.push(Math.floor(p / width));
      xs.push(p % width);
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const area = blob.pixels.length;
    const avgTemp = blob.sum / area;

    const normBox = {
      x: minX / width,
      y: minY / height,
      w: (maxX - minX + 1) / width,
      h: (maxY - minY + 1) / height
    };

    const cls = this.estimateClass(avgTemp, area, width * height);
    const confidence = this.estimateConfidence(cls, avgTemp, ambient);
    const distanceMeters = this.estimateDistanceMeters(normBox.w * width, focalLengthMm, altitudeMeters, width);

    return {
      id: 0, // will be overwritten in tracking
      cls,
      confidence,
      bbox: normBox,
      peakTemp: blob.peak,
      avgTemp,
      distanceMeters,
      timestamp
    };
  }

  private estimateClass(avgTemp: number, area: number, totalPx: number): ThermalClass {
    const areaRatio = area / totalPx;
    if (avgTemp >= this.cfg.humanMin && avgTemp <= this.cfg.humanMax && areaRatio >= 0.0002 && areaRatio <= 0.02) {
      return 'human';
    }
    if (avgTemp > 40 && areaRatio >= 0.01) {
      return 'vehicle';
    }
    if (avgTemp >= 30 && avgTemp < this.cfg.humanMin) {
      return 'animal';
    }
    if (avgTemp >= this.cfg.humanMin - 3) {
      return 'hot-spot';
    }
    return 'unknown';
  }

  private estimateConfidence(cls: ThermalClass, avgTemp: number, ambient: number): number {
    switch (cls) {
      case 'human':
        return this.clamp01((avgTemp - this.cfg.humanMin) / (this.cfg.humanMax - this.cfg.humanMin));
      case 'vehicle':
        return this.clamp01((avgTemp - ambient) / 30);
      case 'animal':
        return 0.4;
      case 'hot-spot':
        return this.clamp01((avgTemp - ambient) / 15);
      default:
        return 0.2;
    }
  }

  private clamp01(n: number): number {
    return Math.max(0, Math.min(1, n));
  }

  /** Very rough distance estimate using pinhole model and apparent width in pixels. */
  private estimateDistanceMeters(apparentWidthPx: number, focalLengthMm: number, altitudeMeters: number, sensorWidthPx: number): number {
    if (!apparentWidthPx || !focalLengthMm) return altitudeMeters;
    // Assume object real width ~0.5m (human torso) as baseline
    const objectWidthMeters = 0.5;
    // Using similar triangles: Z = (f * W) / w ; here f scales with sensor pixel width proportionally
    const fPixels = focalLengthMm * (sensorWidthPx / 4.8); // assuming 4.8mm sensor width
    return (fPixels * objectWidthMeters) / apparentWidthPx;
  }

  private track(dets: ThermalDetection[], ts: number): ThermalDetection[] {
    const updated: TrackState[] = [];
    const results: ThermalDetection[] = [];

    for (const det of dets) {
      const centerX = det.bbox.x + det.bbox.w / 2;
      const centerY = det.bbox.y + det.bbox.h / 2;
      let best: TrackState | null = null;
      let bestDist = Number.MAX_VALUE;

      for (const t of this.tracks) {
        const dx = centerX - t.x;
        const dy = centerY - t.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist && dist <= this.cfg.movementMaxDelta / 640) {
          bestDist = dist;
          best = t;
        }
      }

      if (best) {
        best.x = centerX;
        best.y = centerY;
        best.w = det.bbox.w;
        best.h = det.bbox.h;
        best.lastTs = ts;
        results.push({ ...det, id: best.id });
        updated.push(best);
      } else {
        const id = this.nextTrackId++;
        const state: TrackState = { id, x: centerX, y: centerY, w: det.bbox.w, h: det.bbox.h, lastTs: ts };
        updated.push(state);
        results.push({ ...det, id });
      }
    }

    // Retain recent tracks to improve continuity
    this.tracks = updated;
    return results;
  }

  private async logDetections(dets: ThermalDetection[], frame: ThermalFrame, ambient: number): Promise<void> {
    if (!this.logger) return;
    const entries = dets.map(d => ({
      type: 'thermal_detection',
      id: d.id,
      cls: d.cls,
      confidence: d.confidence,
      peakTemp: d.peakTemp,
      avgTemp: d.avgTemp,
      bbox: d.bbox,
      distanceMeters: d.distanceMeters,
      ambient,
      timestamp: d.timestamp
    }));
    for (const entry of entries) {
      await this.logger(entry);
    }
  }
}

export default ThermalAnalyzer;
