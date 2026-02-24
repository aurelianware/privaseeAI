// WebSocket streaming — /ws/drone
// Broadcasts raw video frames from the drone to all connected clients.
const { WebSocketServer } = require('ws');

let wss;
const wsClients = new Set();

function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/drone' });
  wss.on('connection', (socket) => {
    wsClients.add(socket);
    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });
}

function broadcastFrame(frame) {
  if (!wss || wsClients.size === 0) return;
  const payload = {
    type: 'frame',
    frame: {
      ...frame,
      data: typeof frame.data === 'string' ? frame.data : Buffer.from(frame.data).toString('base64')
    }
  };
  const message = JSON.stringify(payload);
  wsClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

module.exports = { setupWebSocket, broadcastFrame };
