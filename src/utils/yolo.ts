// Detection backends:
//   FREE tier  → COCO-SSD (MobileNetV2, runs in-browser via TF.js)
//   PRO+ tier  → YOLOv8n TF.js GraphModel (higher accuracy, ~6 MB)
//
// YOLOv8n model setup (one-time, done by ops):
//   1. pip install ultralytics
//   2. yolo export model=yolov8n.pt format=tfjs
//   3. Upload the generated web_model/ folder to Azure Blob:
//      az storage blob upload-batch -s yolov8n_web_model -d models/yolov8n_web_model \
//        --account-name privaseeaistorage
//   4. Enable CORS on the storage account for https://privaseeai.net
//
// The model URL below is the canonical location; the loader gracefully falls back
// to COCO-SSD if the model is unreachable (e.g. dev without the file uploaded).

import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

export interface YOLODetection {
  bbox: [number, number, number, number]; // [x, y, width, height] normalised 0-1
  score: number;
  classId: number;
  className: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// SAS token is read-only (permissions: rl), expires 2028-02-23.
// To renew: az storage container generate-sas --name models --permissions rl --expiry <date> --https-only
const YOLOV8_MODEL_URL =
  'https://privaseeaistorage.blob.core.windows.net/models/yolov8n_web_model/model.json' +
  '?se=2028-02-23T00%3A00%3A00Z&sp=rl&spr=https&sv=2026-02-06&sr=c&sig=RN0MCGJpVe%2FEukIAWXLAvO4A%2B1iPeeebHhtqfpNzbfw%3D';
const YOLOV8_INPUT_SIZE = 640;
const YOLOV8_CONF_THRESHOLD = 0.35;
const YOLOV8_IOU_THRESHOLD  = 0.45;
const YOLOV8_MAX_DETECTIONS = 50;

// Standard COCO 80-class labels (same order as YOLOv8 head output)
const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
  'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
  'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
  'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
  'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
  'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
  'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
  'remote','keyboard','cell phone','microwave','oven','toaster','sink',
  'refrigerator','book','clock','vase','scissors','teddy bear','hair drier',
  'toothbrush',
];

// ─── YOLOModel class ──────────────────────────────────────────────────────────

export class YOLOModel {
  private cocoModel: cocoSsd.ObjectDetection | null = null;
  private graphModel: tf.GraphModel | null = null;
  private usingYoloV8 = false;

  /** Returns which backend is active */
  get backend(): 'yolov8' | 'coco-ssd' | 'none' {
    if (this.usingYoloV8 && this.graphModel) return 'yolov8';
    if (this.cocoModel) return 'coco-ssd';
    return 'none';
  }

  /**
   * Load the detection model.
   * @param useYoloV8 If true, attempt to load the YOLOv8n TF.js model from
   *                  Azure Blob first; falls back to COCO-SSD on failure.
   */
  async loadModel(useYoloV8 = false): Promise<boolean> {
    if (useYoloV8) {
      try {
        console.log('🔭 Loading YOLOv8n model from Azure Blob…');
        this.graphModel = await tf.loadGraphModel(YOLOV8_MODEL_URL);
        this.usingYoloV8 = true;
        console.log('✅ YOLOv8n loaded — PRO detection active');
        return true;
      } catch (err) {
        console.warn('⚠️ YOLOv8n unavailable, falling back to COCO-SSD:', (err as Error).message);
      }
    }

    try {
      console.log('Loading COCO-SSD model…');
      this.cocoModel = await cocoSsd.load({ base: 'mobilenet_v2' });
      this.usingYoloV8 = false;
      console.log('✅ COCO-SSD model loaded');
      return true;
    } catch (err) {
      console.error('Failed to load COCO-SSD model:', err);
      return false;
    }
  }

  async detect(
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): Promise<YOLODetection[]> {
    if (this.usingYoloV8 && this.graphModel) {
      return this.detectYoloV8(imageElement);
    }
    if (this.cocoModel) {
      return this.detectCocoSsd(imageElement);
    }
    return this.mockDetection();
  }

  // ─── YOLOv8 backend ─────────────────────────────────────────────────────────

  private async detectYoloV8(
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): Promise<YOLODetection[]> {
    const imgW = (imageElement instanceof HTMLVideoElement)
      ? (imageElement.videoWidth  || imageElement.width)
      : imageElement.width;
    const imgH = (imageElement instanceof HTMLVideoElement)
      ? (imageElement.videoHeight || imageElement.height)
      : imageElement.height;

    // Preprocess: resize to 640×640 and normalise to [0, 1]
    const input = tf.tidy(() => {
      const img = tf.browser.fromPixels(imageElement);
      const resized = tf.image.resizeBilinear(img, [YOLOV8_INPUT_SIZE, YOLOV8_INPUT_SIZE]);
      const normalised = resized.div(255.0);
      return normalised.expandDims(0); // [1, 640, 640, 3]
    });

    let detections: YOLODetection[] = [];

    try {
      // YOLOv8 TF.js export produces output shape [1, 84, 8400]
      // 84 = 4 (cx,cy,w,h) + 80 (class scores)
      const rawOutput = await this.graphModel!.executeAsync(input) as tf.Tensor;
      const output = rawOutput.squeeze([0]); // [84, 8400]

      // Transpose to [8400, 84] for easier slicing
      const transposed = output.transpose(); // [8400, 84]

      const boxesCxcywh = transposed.slice([0, 0], [-1, 4]);  // [8400, 4]
      const classScores  = transposed.slice([0, 4], [-1, -1]); // [8400, 80]

      const maxScores  = classScores.max(1);    // [8400]
      const classIds   = classScores.argMax(1); // [8400]

      // Convert cx,cy,w,h → y1,x1,y2,x2 (normalised) for NMS
      const [cx, cy, w, h] = tf.split(boxesCxcywh, 4, 1);
      const x1 = cx.sub(w.div(2));
      const y1 = cy.sub(h.div(2));
      const x2 = cx.add(w.div(2));
      const y2 = cy.add(h.div(2));
      // tf.image.nonMaxSuppression expects [y1, x1, y2, x2]
      const yx1x2 = tf.concat([y1, x1, y2, x2], 1); // [8400, 4]

      const scoresArr  = await maxScores.array() as number[];
      const classArr   = await classIds.array() as number[];
      const boxesArr   = await yx1x2.array() as number[][];

      const nmsBoxes  = tf.tensor2d(boxesArr);
      const nmsScores = tf.tensor1d(scoresArr);

      const selected = await tf.image.nonMaxSuppressionAsync(
        nmsBoxes, nmsScores, YOLOV8_MAX_DETECTIONS,
        YOLOV8_IOU_THRESHOLD, YOLOV8_CONF_THRESHOLD
      );
      const selectedIndices = await selected.array() as number[];

      // Scale boxes back to image coordinates, then normalise
      detections = selectedIndices.map(i => {
        const [y1n, x1n, y2n, x2n] = boxesArr[i];
        // YOLOv8 outputs are relative to the 640×640 input; already 0-1 normalised
        const bx = Math.max(0, x1n);
        const by = Math.max(0, y1n);
        const bw = Math.min(1, x2n) - bx;
        const bh = Math.min(1, y2n) - by;
        return {
          bbox: [bx, by, bw, bh] as [number, number, number, number],
          score: scoresArr[i],
          classId: classArr[i],
          className: COCO_CLASSES[classArr[i]] ?? 'unknown',
        };
      });

      // Cleanup tensors
      tf.dispose([rawOutput, output, transposed, boxesCxcywh, classScores,
                  maxScores, classIds, cx, cy, w, h, x1, y1, x2, y2,
                  yx1x2, nmsBoxes, nmsScores, selected]);

    } catch (err) {
      console.error('YOLOv8 inference error:', err);
    }

    tf.dispose(input);
    void imgW; void imgH; // suppress unused-var lint (kept for future letterbox calc)
    return detections;
  }

  // ─── COCO-SSD backend ────────────────────────────────────────────────────────

  private async detectCocoSsd(
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): Promise<YOLODetection[]> {
    const imgW = (imageElement instanceof HTMLVideoElement)
      ? (imageElement.videoWidth  || imageElement.width)
      : imageElement.width;
    const imgH = (imageElement instanceof HTMLVideoElement)
      ? (imageElement.videoHeight || imageElement.height)
      : imageElement.height;

    const predictions = await this.cocoModel!.detect(imageElement);

    return predictions.map((p, i) => ({
      bbox: [
        p.bbox[0] / imgW,
        p.bbox[1] / imgH,
        p.bbox[2] / imgW,
        p.bbox[3] / imgH,
      ] as [number, number, number, number],
      score: p.score,
      classId: i,
      className: p.class,
    }));
  }

  // ─── Mock fallback ───────────────────────────────────────────────────────────

  private mockDetection(): YOLODetection[] {
    if (Date.now() % 10000 < 100) {
      return [{
        bbox: [0.3, 0.3, 0.4, 0.4],
        score: 0.85,
        classId: 0,
        className: 'person',
      }];
    }
    return [];
  }

  dispose(): void {
    if (this.graphModel) {
      this.graphModel.dispose();
      this.graphModel = null;
    }
    this.cocoModel = null;
  }
}

export default YOLOModel;
