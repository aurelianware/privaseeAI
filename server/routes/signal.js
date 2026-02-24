// ─── Signaling REST helpers ────────────────────────────────────────────────────
const { randomUUID } = require('crypto');
const { getPrisma } = require('../db');
const {
  signalingUserSockets,
  signalingRooms,
  signalingTokens,
  cleanExpiredTokens,
} = require('../signal-ws');

function createSignalRoutes(app) {
  // GET /api/signal/users/search?q=<email or name>
  app.get('/api/signal/users/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const db = getPrisma();
    if (!db) return res.json([]);
    try {
      const users = await db.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name:  { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 20,
      });
      const onlineSet = new Set(signalingUserSockets.keys());
      res.json(users.map(u => ({ ...u, online: onlineSet.has(u.id) })));
    } catch (err) {
      console.error('User search error:', err);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // GET /api/signal/users/online
  app.get('/api/signal/users/online', (_, res) => {
    const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
    res.json(list);
  });

  // POST /api/signal/rooms  →  { roomId, token }
  app.post('/api/signal/rooms', (req, res) => {
    cleanExpiredTokens();
    const roomId = randomUUID();
    const token  = randomUUID();
    signalingRooms.set(roomId, new Set());
    signalingTokens.set(token, { roomId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    res.json({ roomId, token });
  });

  // GET /api/signal/rooms/:token  →  { roomId } or 404
  app.get('/api/signal/rooms/:token', (req, res) => {
    const entry = signalingTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) return res.status(404).json({ error: 'Token not found or expired' });
    res.json({ roomId: entry.roomId });
  });
}

module.exports = { createSignalRoutes };
