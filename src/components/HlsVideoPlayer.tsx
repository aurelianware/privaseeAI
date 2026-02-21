import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Hls from 'hls.js';

interface HlsVideoPlayerProps {
  src: string;
  className?: string;
  label?: string;
}

/**
 * HLS video player — uses native HLS on Safari, hls.js on Chrome/Firefox.
 * Suitable for the AGM Taipan thermal RTSP→HLS proxy stream.
 *
 * Forwards the underlying <video> element ref so callers can call
 * videoEl.captureStream(30) to share the feed over WebRTC.
 */
const HlsVideoPlayer = forwardRef<HTMLVideoElement, HlsVideoPlayerProps>(
  ({ src, className = '', label }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Expose the inner video element to the parent via ref
  useImperativeHandle(ref, () => videoRef.current!, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Destroy existing instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {/* autoplay may be blocked — user can click */});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error', data);
          hls.destroy();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = src;
      video.play().catch(() => {});
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      muted
      playsInline
      controls
      aria-label={label ?? 'HLS video stream'}
    />
  );
});

HlsVideoPlayer.displayName = 'HlsVideoPlayer';

export default HlsVideoPlayer;
