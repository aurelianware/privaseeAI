// ─── RTSP URL validation + multi-stream RTSP → HLS proxy ─────────────────────
// Each stream gets its own subdir: <baseStreamsDir>/<id>/stream.m3u8
// Served at: /streams/<id>/stream.m3u8
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const express = require('express');

// ─── RTSP URL validation ──────────────────────────────────────────────────────
// Only allow rtsp:// or rtsps:// schemes and block private/internal IP ranges
// to prevent SSRF via ffmpeg.
const _PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i;

function isValidRtspUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['rtsp:', 'rtsps:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname;
    if (!hostname) return false;
    if (_PRIVATE_IP_RE.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const baseStreamsDir = path.join(os.tmpdir(), 'privaseeai-streams');
fs.mkdirSync(baseStreamsDir, { recursive: true });

// Map<id, { id, name, url, process }>
const activeStreams = new Map();

function streamDir(id) {
  return path.join(baseStreamsDir, id);
}

function startStream(id, name, rtspUrl) {
  const existing = activeStreams.get(id);
  if (existing?.process) existing.process.kill('SIGTERM');
  const dir = streamDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const args = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-c:a', 'aac',
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+append_list',
    path.join(dir, 'stream.m3u8')
  ];
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', d => console.log(`[stream:${id}]`, d.toString().trim()));
  proc.on('exit', code => {
    console.log(`[stream:${id}] ffmpeg exited with code ${code}`);
    const entry = activeStreams.get(id);
    if (entry) activeStreams.set(id, { ...entry, process: null });
  });
  activeStreams.set(id, { id, name: name || id, url: rtspUrl, process: proc });
  console.log(`[stream:${id}] Proxying ${rtspUrl} → /streams/${id}/stream.m3u8`);
  return { id, name: name || id, url: rtspUrl, hlsUrl: `/streams/${id}/stream.m3u8` };
}

function stopStream(id) {
  const entry = activeStreams.get(id);
  if (entry?.process) entry.process.kill('SIGTERM');
  activeStreams.delete(id);
}

function streamStatus(id) {
  const entry = activeStreams.get(id);
  if (!entry) return null;
  const hlsPath = path.join(streamDir(id), 'stream.m3u8');
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    active: !!entry.process,
    hlsUrl: fs.existsSync(hlsPath) ? `/streams/${id}/stream.m3u8` : null,
  };
}

// Backward-compat probe URLs for thermal cameras
const THERMAL_PROBE_URLS = [
  'rtsp://192.168.10.1:554/stream',
  'rtsp://192.168.10.1:554/live',
  'rtsp://192.168.10.1:554/live/ch0',
  'rtsp://192.168.10.1:554/ch0',
  'rtsp://192.168.10.1/stream',
  'rtsp://192.168.1.1:554/stream',
  'rtsp://192.168.1.1:554/live',
];

function createStreamRoutes(app) {
  // Serve HLS segments for all streams
  app.use('/streams', express.static(baseStreamsDir));

  // Serve /thermal/* from the thermal stream dir
  app.use('/thermal', (req, res, next) => {
    express.static(streamDir('thermal'))(req, res, next);
  });

  // Auto-start thermal from env var (backward compat)
  if (process.env.RTSP_THERMAL_URL) {
    startStream('thermal', 'AGM Taipan', process.env.RTSP_THERMAL_URL);
  }

  // ─── /api/streams CRUD ───────────────────────────────────────────────────────

  app.get('/api/streams', (_req, res) => {
    const list = [...activeStreams.values()].map(e => {
      const hlsPath = path.join(streamDir(e.id), 'stream.m3u8');
      return {
        id: e.id,
        name: e.name,
        url: e.url,
        active: !!e.process,
        hlsUrl: fs.existsSync(hlsPath) ? `/streams/${e.id}/stream.m3u8` : null,
      };
    });
    res.json(list);
  });

  app.post('/api/streams', (req, res) => {
    const { id, name, url } = req.body;
    if (!id || !url) return res.status(400).json({ error: 'id and url required' });
    if (!isValidRtspUrl(url)) return res.status(400).json({ error: 'Invalid RTSP URL — only rtsp:// and rtsps:// schemes are permitted' });
    const result = startStream(id, name || id, url);
    res.json(result);
  });

  app.delete('/api/streams/:id', (req, res) => {
    stopStream(req.params.id);
    res.json({ status: 'stopped', id: req.params.id });
  });

  // ─── Backward-compat /thermal aliases ────────────────────────────────────────

  app.post('/api/thermal/start', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    if (!isValidRtspUrl(url)) return res.status(400).json({ error: 'Invalid RTSP URL — only rtsp:// and rtsps:// schemes are permitted' });
    startStream('thermal', 'AGM Taipan', url);
    res.json({ status: 'started', url });
  });

  app.post('/api/thermal/stop', (_req, res) => {
    stopStream('thermal');
    res.json({ status: 'stopped' });
  });

  app.get('/api/thermal/status', (_req, res) => {
    const s = streamStatus('thermal');
    res.json(s
      ? { active: s.active, rtspUrl: s.url, hlsUrl: s.hlsUrl }
      : { active: false, rtspUrl: null, hlsUrl: null });
  });

  app.post('/api/thermal/probe', async (_req, res) => {
    const results = [];
    for (const url of THERMAL_PROBE_URLS) {
      await new Promise((resolve) => {
        const p = spawn('ffprobe', [
          '-rtsp_transport', 'tcp', '-v', 'quiet',
          '-print_format', 'json', '-show_streams',
          '-timeout', '3000000', url
        ]);
        let stdout = '';
        p.stdout.on('data', d => stdout += d);
        p.on('exit', code => {
          results.push({ url, reachable: code === 0, streams: code === 0 ? JSON.parse(stdout || '{}').streams?.length ?? 0 : 0 });
          resolve();
        });
        setTimeout(() => { p.kill(); resolve(); }, 4000);
      });
    }
    const found = results.find(r => r.reachable);
    if (found) startStream('thermal', 'AGM Taipan', found.url);
    res.json({ results, started: found?.url ?? null });
  });
}

module.exports = { isValidRtspUrl, startStream, stopStream, streamStatus, activeStreams, createStreamRoutes };
