// ─── SIEM / audit log export ──────────────────────────────────────────────────
//
// GET /api/events/export
// Query params:
//   format  csv (default) | jsonl
//   since   ISO 8601 date — only events after this timestamp
//   limit   max rows to return (default 5000, cap 10000)
//
// ENTERPRISE-gated. Returns a downloadable file.
const { verifyEntraTokenAsync, requireEnterprise } = require('../auth');
const { getPrisma }                                = require('../db');

function createAuditRoutes(app) {
  app.get('/api/events/export', requireEnterprise, async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

    const format = req.query.format === 'jsonl' ? 'jsonl' : 'csv';
    const limit  = Math.min(parseInt(req.query.limit || '5000', 10), 10000);
    const since  = req.query.since ? new Date(req.query.since) : undefined;
    if (since && isNaN(since.getTime())) {
      return res.status(400).json({ error: 'Invalid `since` date' });
    }

    const db = getPrisma();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    try {
      // Resolve User row from email so we can filter Event by userId
      const userRow = identity.email
        ? await db.user.findUnique({ where: { email: identity.email } })
        : null;

      const eventWhere = {
        ...(userRow && { userId: userRow.id }),
        ...(since && { timestamp: { gte: since } }),
      };
      const events = await db.event.findMany({
        where: Object.keys(eventWhere).length ? eventWhere : undefined,
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true, kind: true, eventType: true, confidence: true,
          timestamp: true, detections: true, mediaUrl: true,
          thumbnailUrl: true, videoUrl: true, deviceId: true,
          priority: true, synced: true, createdAt: true,
        },
      });

      const logsWhere = {
        type: { in: ['motion', 'detection_dispatch', 'notify'] },
        ...(since && { createdAt: { gte: since } }),
      };
      const logs = await db.systemLog.findMany({
        where: logsWhere,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 2000),
        select: { id: true, type: true, message: true, data: true, correlationId: true, createdAt: true },
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename  = `privaseeai-export-${timestamp}.${format}`;

      if (format === 'jsonl') {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        for (const e of events) {
          res.write(JSON.stringify({ source: 'event', ...e }) + '\n');
        }
        for (const l of logs) {
          res.write(JSON.stringify({ source: 'systemlog', ...l }) + '\n');
        }
        return res.end();
      }

      // CSV output
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const eventHeaders = 'source,id,kind,eventType,confidence,timestamp,detectionCount,mediaUrl,thumbnailUrl,videoUrl,deviceId,priority,synced,createdAt';
      res.write(eventHeaders + '\n');
      for (const e of events) {
        const detCount = (() => {
          try { return JSON.parse(e.detections || '[]').length; } catch { return 0; }
        })();
        const row = [
          'event', e.id, e.kind, e.eventType, e.confidence,
          e.timestamp?.toISOString(), detCount,
          e.mediaUrl, e.thumbnailUrl, e.videoUrl, e.deviceId,
          e.priority, e.synced, e.createdAt?.toISOString(),
        ].map(esc).join(',');
        res.write(row + '\n');
      }

      for (const l of logs) {
        const row = [
          'systemlog', l.id, l.type, '', '',
          l.createdAt?.toISOString(), '',
          '', '', '', '',
          '', '', l.createdAt?.toISOString(),
        ].map(esc).join(',');
        res.write(row + '\n');
      }

      return res.end();
    } catch (err) {
      console.error('GET /api/events/export error:', err);
      return res.status(500).json({ error: 'Export failed' });
    }
  });
}

module.exports = { createAuditRoutes };
