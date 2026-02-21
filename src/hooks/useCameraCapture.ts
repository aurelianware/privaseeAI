/**
 * useCameraCapture — resolves which camera feed to share over WebRTC.
 *
 * Source types:
 *   'webcam'          → the MediaStream already captured by CameraStream
 *   'hls:<streamId>'  → canvas captureStream() from an HLS <video> element
 *   'drone'           → canvas captureStream() from the drone display canvas
 *
 * HLS / drone sources use captureStream(30) so the resulting MediaStream is
 * indistinguishable from a webcam stream at the WebRTC layer.
 * All media travels peer-to-peer (DTLS-SRTP) after ICE — the server never
 * sees the frames.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraSourceId = 'webcam' | `hls:${string}` | 'drone';

export interface CameraSource {
  id: CameraSourceId;
  label: string;
}

interface UseCameraCaptureOptions {
  webcamStream: MediaStream | null;
  /** HLS streams from App.tsx state */
  hlsStreams: { id: string; name: string; hlsUrl: string | null }[];
  /** Map of streamId → <video> element (provided by HlsVideoPlayer via ref) */
  hlsVideoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  /** The drone display canvas element (set by MissionDashboard / drone tab) */
  droneCanvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function useCameraCapture({
  webcamStream,
  hlsStreams,
  hlsVideoRefs,
  droneCanvasRef,
}: UseCameraCaptureOptions) {
  const [selectedSource, setSelectedSource] = useState<CameraSourceId>('webcam');
  const canvasCaptureRef = useRef<MediaStream | null>(null);

  // Build the list of available sources
  const availableSources: CameraSource[] = [
    { id: 'webcam', label: 'Webcam' },
    ...hlsStreams
      .filter(s => s.hlsUrl)
      .map(s => ({ id: `hls:${s.id}` as CameraSourceId, label: s.name })),
    ...(droneCanvasRef ? [{ id: 'drone' as CameraSourceId, label: 'Drone feed' }] : []),
  ];

  const getCapturedStream = useCallback((): MediaStream | null => {
    if (selectedSource === 'webcam') {
      return webcamStream;
    }

    if (selectedSource === 'drone' && droneCanvasRef?.current) {
      // Stop previous canvas capture if switching sources
      canvasCaptureRef.current?.getTracks().forEach(t => t.stop());
      const stream = (droneCanvasRef.current as HTMLCanvasElement & {
        captureStream(fps?: number): MediaStream;
      }).captureStream(30);
      canvasCaptureRef.current = stream;
      return stream;
    }

    if (selectedSource.startsWith('hls:')) {
      const streamId  = selectedSource.slice(4);
      const videoEl   = hlsVideoRefs.current.get(streamId);
      if (!videoEl) return null;
      canvasCaptureRef.current?.getTracks().forEach(t => t.stop());
      const stream = (videoEl as HTMLVideoElement & {
        captureStream(fps?: number): MediaStream;
      }).captureStream(30);
      canvasCaptureRef.current = stream;
      return stream;
    }

    return null;
  }, [selectedSource, webcamStream, droneCanvasRef, hlsVideoRefs]);

  // Stop any canvas capture stream when the component unmounts
  useEffect(() => {
    return () => {
      canvasCaptureRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { availableSources, selectedSource, setSelectedSource, getCapturedStream };
}
