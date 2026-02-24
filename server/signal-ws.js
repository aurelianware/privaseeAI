// ─── WebRTC Signaling WebSocket (/ws/signal) ──────────────────────────────────
// Pure relay — the server never touches media.  All video flows peer-to-peer
// via DTLS-SRTP after the ICE handshake.
//
// In-memory state (lost on restart — rooms are transient by design).
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const signalingUserSockets = new Map();  // entraOid → { ws, displayName }
const signalingRooms       = new Map();  // roomId   → Set<entraOid>
const signalingTokens      = new Map();  // token    → { roomId, expiresAt }

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, { expiresAt }] of signalingTokens) {
    if (now > expiresAt) signalingTokens.delete(token);
  }
}

function broadcastOnlineUsers() {
  const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
  const msg = JSON.stringify({ type: 'online_users', users: list });
  for (const { ws } of signalingUserSockets.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function relayTo(targetOid, payload) {
  const target = signalingUserSockets.get(targetOid);
  if (target && target.ws.readyState === 1) {
    target.ws.send(JSON.stringify(payload));
  }
}

function setupSignalingWebSocket(server) {
  const sigWss = new WebSocketServer({ server, path: '/ws/signal' });

  sigWss.on('connection', (ws) => {
    let myOid = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'register': {
          myOid = msg.entraOid;
          if (!myOid) break;
          signalingUserSockets.set(myOid, { ws, displayName: msg.displayName || myOid });
          // Send the joining user the current online list
          const list = [...signalingUserSockets.entries()].map(([oid, { displayName }]) => ({ oid, displayName }));
          ws.send(JSON.stringify({ type: 'online_users', users: list }));
          // Notify others
          broadcastOnlineUsers();
          break;
        }

        case 'create_room': {
          if (!myOid) break;
          cleanExpiredTokens();
          const roomId = randomUUID();
          const token  = randomUUID();
          signalingRooms.set(roomId, new Set([myOid]));
          signalingTokens.set(token, { roomId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
          ws.send(JSON.stringify({ type: 'room_created', roomId, token }));
          break;
        }

        case 'join_room': {
          if (!myOid) break;
          let roomId = msg.roomId;
          // Support invite token
          if (!roomId && msg.token) {
            const entry = signalingTokens.get(msg.token);
            if (!entry || Date.now() > entry.expiresAt) {
              ws.send(JSON.stringify({ type: 'error', code: 'token_expired' }));
              break;
            }
            roomId = entry.roomId;
          }
          if (!roomId || !signalingRooms.has(roomId)) {
            ws.send(JSON.stringify({ type: 'error', code: 'room_not_found' }));
            break;
          }
          const room = signalingRooms.get(roomId);
          if (room.size >= 6) {
            ws.send(JSON.stringify({ type: 'error', code: 'room_full' }));
            break;
          }
          // Notify existing members about the new peer
          for (const peerOid of room) {
            relayTo(peerOid, { type: 'peer_joined', peerOid: myOid, displayName: signalingUserSockets.get(myOid)?.displayName || myOid, roomId });
          }
          room.add(myOid);
          // Tell the joiner who's already in the room
          const peers = [...room].filter(o => o !== myOid).map(o => ({ oid: o, displayName: signalingUserSockets.get(o)?.displayName || o }));
          ws.send(JSON.stringify({ type: 'room_joined', roomId, peers }));
          break;
        }

        case 'leave_room': {
          if (!myOid) break;
          for (const [roomId, room] of signalingRooms) {
            if (room.has(myOid)) {
              room.delete(myOid);
              for (const peerOid of room) {
                relayTo(peerOid, { type: 'peer_left', peerOid: myOid });
              }
              if (room.size === 0) signalingRooms.delete(roomId);
            }
          }
          break;
        }

        case 'call_invite': {
          if (!myOid || !msg.targetOid || !msg.roomId) break;
          relayTo(msg.targetOid, {
            type: 'call_invite',
            fromOid: myOid,
            displayName: signalingUserSockets.get(myOid)?.displayName || myOid,
            roomId: msg.roomId,
            token: msg.token,
          });
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice_candidate': {
          if (!myOid || !msg.targetOid) break;
          relayTo(msg.targetOid, { ...msg, fromOid: myOid });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!myOid) return;
      signalingUserSockets.delete(myOid);
      // Remove from all rooms
      for (const [roomId, room] of signalingRooms) {
        if (room.has(myOid)) {
          room.delete(myOid);
          for (const peerOid of room) {
            relayTo(peerOid, { type: 'peer_left', peerOid: myOid });
          }
          if (room.size === 0) signalingRooms.delete(roomId);
        }
      }
      broadcastOnlineUsers();
    });

    ws.on('error', () => ws.terminate());
  });
}

module.exports = {
  setupSignalingWebSocket,
  signalingUserSockets,
  signalingRooms,
  signalingTokens,
  cleanExpiredTokens,
};
