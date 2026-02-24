// Device Discovery — server-polling implementation
//
// Browsers cannot do mDNS/SSDP/UDP, so discovery works via self-registration:
// every device that opens the app calls POST /api/devices on login and sends a
// heartbeat PATCH every 30 s (see DeviceRegistry.startHeartbeat).
// This service polls GET /api/devices and maps the results to NetworkDevice so
// MultiDeviceDashboard can display real online/offline status.

export interface DiscoveryProtocol {
  name: string;
  port: number;
  protocol: 'udp' | 'tcp' | 'multicast' | 'bluetooth' | 'nfc';
  enabled: boolean;
}

export interface DeviceAnnouncement {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  networkInfo: {
    ipAddress: string;
    port: number;
    macAddress?: string;
  };
  apiEndpoints: {
    status: string;
    events: string;
    stream?: string;
    control?: string;
  };
  authRequired: boolean;
  version: string;
  timestamp: Date;
}

export interface NetworkDevice {
  id: string;
  ipAddress: string;
  port: number;
  lastSeen: Date;
  responseTime: number;
  status: 'responding' | 'timeout' | 'error';
  deviceInfo?: DeviceAnnouncement;
}

// Devices that haven't sent a heartbeat within this window are shown as offline
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export class DeviceDiscoveryService {
  private devices: NetworkDevice[] = [];
  private pollInterval?: ReturnType<typeof setInterval>;
  private idToken: string | null = null;

  setIdToken(token: string): void {
    this.idToken = token;
  }

  async startDiscovery(): Promise<void> {
    await this.fetchFromServer();
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => void this.fetchFromServer(), 30_000);
  }

  async stopDiscovery(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  getDiscoveredDevices(): NetworkDevice[] {
    return this.devices;
  }

  async addManualDevice(ipAddress: string, _port = 80): Promise<NetworkDevice | null> {
    // Manual devices must be registered server-side; refresh and return if found
    await this.fetchFromServer();
    return this.devices.find(d => d.ipAddress === ipAddress) ?? null;
  }

  private async fetchFromServer(): Promise<void> {
    if (!this.idToken) return;
    try {
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Bearer ${this.idToken}` },
      });
      if (!res.ok) return;

      const rows: Array<{
        id: string;
        name: string;
        type: string;
        ipAddress: string | null;
        lastSeen: string;
        updatedAt: string;
        capabilities: string | null;
      }> = await res.json();

      const now = Date.now();
      this.devices = rows.map(row => {
        const lastSeen = new Date(row.lastSeen);
        const isOnline = now - lastSeen.getTime() < ONLINE_THRESHOLD_MS;
        return {
          id: row.id,
          ipAddress: row.ipAddress ?? '—',
          port: 443,
          lastSeen,
          responseTime: 0,
          status: isOnline ? 'responding' : 'timeout',
          deviceInfo: {
            deviceId: row.id,
            deviceName: row.name,
            deviceType: row.type,
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
            networkInfo: { ipAddress: row.ipAddress ?? '—', port: 443 },
            apiEndpoints: {
              status: `/api/devices/${row.id}`,
              events: '/api/events',
            },
            authRequired: true,
            version: '1.0',
            timestamp: new Date(row.updatedAt),
          } satisfies DeviceAnnouncement,
        } satisfies NetworkDevice;
      });
    } catch {
      // Network error — keep stale data
    }
  }
}

// Device Communication Service — retained for future use
export class DeviceCommunicationService {
  private connections: Map<string, WebSocket> = new Map();

  async connectToDevice(device: NetworkDevice): Promise<boolean> {
    try {
      if (!device.deviceInfo?.apiEndpoints.control) {
        throw new Error('Device does not support control endpoint');
      }
      const wsUrl = device.deviceInfo.apiEndpoints.control.replace('http', 'ws');
      const ws = new WebSocket(wsUrl);
      return new Promise((resolve, reject) => {
        ws.onopen = () => { this.connections.set(device.id, ws); resolve(true); };
        ws.onerror = () => reject(false);
        ws.onmessage = (event) => { this.handleDeviceMessage(device.id, event.data); };
      });
    } catch {
      return false;
    }
  }

  async sendCommand(deviceId: string, command: unknown): Promise<void> {
    const connection = this.connections.get(deviceId);
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      throw new Error(`No active connection to device: ${deviceId}`);
    }
    connection.send(JSON.stringify(command));
  }

  private handleDeviceMessage(deviceId: string, message: unknown): void {
    console.log(`Message from ${deviceId}:`, message);
  }
}
