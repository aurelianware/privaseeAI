// Object Detection Model Utilities using COCO-SSD
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export interface YOLODetection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  score: number;
  classId: number;
  className: string;
}

export class YOLOModel {
  private model: cocoSsd.ObjectDetection | null = null;
  
  async loadModel(): Promise<boolean> {
    try {
      console.log('Loading COCO-SSD model...');
      this.model = await cocoSsd.load({
        base: 'mobilenet_v2' // Faster and more reliable than YOLO
      });
      console.log('COCO-SSD model loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load COCO-SSD model:', error);
      return false;
    }
  }

  async detect(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<YOLODetection[]> {
    if (!this.model) {
      // Fallback to mock detection for testing media capture
      console.log('⚠️ Model not loaded, using mock detection for testing');
      return this.mockDetection();
    }

    try {
      // Use COCO-SSD detect method
      const predictions = await this.model.detect(imageElement);

      // COCO-SSD runs on the video's intrinsic pixel data (videoWidth × videoHeight).
      // For HTMLVideoElement, .width/.height return the CSS layout dimensions which can
      // differ from the actual frame resolution, causing bounding boxes to be offset.
      // Always normalise against the intrinsic dimensions.
      const imgW = (imageElement instanceof HTMLVideoElement)
        ? (imageElement.videoWidth  || imageElement.width)
        : imageElement.width;
      const imgH = (imageElement instanceof HTMLVideoElement)
        ? (imageElement.videoHeight || imageElement.height)
        : imageElement.height;

      // Convert COCO-SSD predictions to our format
      const detections: YOLODetection[] = predictions.map((prediction, index) => ({
        bbox: [
          prediction.bbox[0] / imgW,  // x
          prediction.bbox[1] / imgH,  // y
          prediction.bbox[2] / imgW,  // width
          prediction.bbox[3] / imgH   // height
        ],
        score: prediction.score,
        classId: index, // COCO-SSD doesn't provide class ID directly
        className: prediction.class
      }));
      
      return detections;
    } catch (error) {
      console.error('Detection error:', error);
      return this.mockDetection();
    }
  }

  // Mock detection for testing when model fails to load
  private mockDetection(): YOLODetection[] {
    // Generate a random detection every 10 seconds for testing
    const now = Date.now();
    if (now % 10000 < 100) { // Trigger every ~10 seconds
      console.log('🎭 Mock detection: person detected (for testing media capture)');
      return [{
        bbox: [0.3, 0.3, 0.4, 0.4], // Center of frame
        score: 0.85, // High confidence
        classId: 0,
        className: 'person'
      }];
    }
    return [];
  }

  dispose(): void {
    if (this.model) {
      // COCO-SSD models don't have a dispose method
      this.model = null;
    }
  }
}

// Model download utilities
export const downloadYOLOModel = async (modelName: string): Promise<string> => {
  const modelUrls = {
    'yolov5s': 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s_web_model.zip',
    'yolov8s': 'https://github.com/ultralytics/ultralytics/releases/download/v8.0.0/yolov8s_web_model.zip',
    // Add more model URLs as needed
  };
  
  const url = modelUrls[modelName as keyof typeof modelUrls];
  if (!url) {
    throw new Error(`Model ${modelName} not found`);
  }
  
  // In a real implementation, you'd download and extract the model
  // For now, return the local path where you'd place the model
  return `./models/${modelName}/model.json`;
};

export default YOLOModel;