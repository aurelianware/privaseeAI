// ─── Mission WebSocket (/ws/mission) ─────────────────────────────────────────
// Bidirectional: server → clients (telemetry/progress/events) AND
//                Android controller → server → clients (telemetry relay).
// Android app authenticates via ?key=DRONE_CONTROLLER_KEY query param.
const { WebSocketServer } = require('ws');

const DRONE_CONTROLLER_KEY = process.env.DRONE_CONTROLLER_KEY || '';

const missionWsClients     = new Set();
const missionWsControllers = new Set(); // Android app connections only

function setupMissionWebSocket(server) {
  const missionWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws/mission')) return;
    const url          = new URL(req.url, 'http://localhost');
    const key          = url.searchParams.get('key') || '';
    const isController = Boolean(DRONE_CONTROLLER_KEY && key === DRONE_CONTROLLER_KEY);
    missionWss.handleUpgrade(req, socket, head, (ws) => {
      missionWss.emit('connection', ws, req, isController);
    });
  });

  missionWss.on('connection', (ws, _req, isController) => {
    missionWsClients.add(ws);
    if (isController) missionWsControllers.add(ws);

    // Relay telemetry/events pushed UP from the Android controller to all viewer clients
    ws.on('message', (raw) => {
      if (!isController) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (['telemetry', 'progress', 'event', 'alert'].includes(msg.type)) {
          for (const client of missionWsClients) {
            if (client !== ws && client.readyState === 1) client.send(raw.toString());
          }
        }
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => { missionWsClients.delete(ws); missionWsControllers.delete(ws); });
    ws.on('error', () => { missionWsClients.delete(ws); missionWsControllers.delete(ws); });
  });
}

function broadcastMission(type, data) {
  if (missionWsClients.size === 0) return;
  const msg = JSON.stringify({ type, data });
  for (const ws of missionWsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// Send a command message to the connected Android controller app(s)
function sendCommandToController(cmd) {
  const msg = JSON.stringify({ type: 'command', data: { cmd } });
  for (const ws of missionWsControllers) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

module.exports = { setupMissionWebSocket, broadcastMission, sendCommandToController };
