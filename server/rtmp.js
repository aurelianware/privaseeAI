// ─── RTMP ingest (node-media-server) ─────────────────────────────────────────
// Android controller app pushes RTMP streams here; server transcodes to HLS
// using the existing startStream() / ffmpeg pipeline.
// Stream keys: rtmp://server:1935/live/evo-visual-<key>  (RGB)
//              rtmp://server:1935/live/evo-thermal-<key> (thermal)
const NodeMediaServer = require('node-media-server');

/**
 * Factory — creates and configures the RTMP server with injected dependencies.
 * Deps are injected to avoid circular imports between rtmp.js ↔ streams.js.
 * @param {{ startStream: Function, stopStream: Function, broadcastMission: Function }} deps
 */
function createNms({ startStream, stopStream, broadcastMission }) {
  const nms = new NodeMediaServer({
    rtmp: { port: 1935, chunk_size: 60000, gop_cache: false, ping: 10, ping_timeout: 30 },
    logType: 0, // suppress NMS internal logs
  });

  // ─── RTMP stream authentication ───────────────────────────────────────────
  // Reject any publish attempt whose stream key doesn't match DRONE_CONTROLLER_KEY.
  // Stream path format: /live/evo-visual-<key>  or  /live/evo-thermal-<key>
  nms.on('prePublish', (id, streamPath) => {
    const controllerKey = process.env.DRONE_CONTROLLER_KEY || '';
    if (!controllerKey) {
      console.warn('[RTMP] DRONE_CONTROLLER_KEY not set — rejecting all publish attempts');
      nms.getSession(id).reject();
      return;
    }

    const name      = streamPath.replace('/live/', '');
    const isVisual  = name.startsWith('evo-visual-');
    const isThermal = name.startsWith('evo-thermal-');

    if (!isVisual && !isThermal) {
      console.warn(`[RTMP] Rejected unknown stream path: ${streamPath}`);
      nms.getSession(id).reject();
      return;
    }

    const prefix    = isVisual ? 'evo-visual-' : 'evo-thermal-';
    const streamKey = name.slice(prefix.length);

    if (streamKey !== controllerKey) {
      console.warn(`[RTMP] Rejected publish on ${streamPath} — invalid stream key`);
      nms.getSession(id).reject();
      return;
    }

    console.log(`[RTMP] Authenticated publish on ${streamPath}`);
  });

  nms.on('postPublish', (_id, streamPath) => {
    const name      = streamPath.replace('/live/', '');
    const isVisual  = name.startsWith('evo-visual');
    const isThermal = name.startsWith('evo-thermal');
    if (!isVisual && !isThermal) return;

    const streamId = isVisual ? 'evo-visual' : 'evo-thermal';
    const label    = isVisual ? 'EVO Visual'  : 'EVO Thermal';
    const rtmpUrl  = `rtmp://localhost:1935${streamPath}`;
    startStream(streamId, label, rtmpUrl);
    broadcastMission('stream_ready', { id: streamId, hlsUrl: `/streams/${streamId}/stream.m3u8` });
    console.log(`[RTMP] ${label} stream live → /streams/${streamId}/stream.m3u8`);
  });

  nms.on('donePublish', (_id, streamPath) => {
    const name     = streamPath.replace('/live/', '');
    const streamId = name.startsWith('evo-visual') ? 'evo-visual' : 'evo-thermal';
    stopStream(streamId);
    broadcastMission('stream_ended', { id: streamId });
    console.log(`[RTMP] ${streamId} stream ended`);
  });

  return nms;
}

module.exports = { createNms };
