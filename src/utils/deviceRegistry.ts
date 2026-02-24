// Multi-Device Management System
export interface Device {
  id: string; // Unique device identifier
  name: string; // User-friendly name
  type: 'raspberry-pi' | 'mobile-ios' | 'mobile-android' | 'desktop-mac' | 'desktop-windows' | 'ip-camera' | 'nest-camera' | 'blink-camera' | 'drone';
  platform: string; // OS/Platform details
  capabilities: DeviceCapabilities;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  location: {
    name: string; // "Front Door", "Living Room", etc.
    coordinates?: { lat: number; lng: number };
  };
  network: {
    ipAddress?: string;
    macAddress?: string;
    lastSeen: Date;
  };
  configuration: DeviceConfiguration;
  metadata: {
    manufacturer?: string;
    model?: string;
    firmwareVersion?: string;
    appVersion?: string;
    registeredAt: Date;
    lastUpdated: Date;
  };
}

export interface DeviceCapabilities {
  hasCamera: boolean;
  hasAudio: boolean;
  canRecord: boolean;
  canStream: boolean;
  canDetectMotion: boolean;
  canDetectObjects: boolean;
  supportedResolutions: string[]; // ['720p', '1080p', '4K']
  supportedFrameRates: number[]; // [15, 30, 60]
  storageCapacity?: number; // MB
  batteryPowered: boolean;
  canPTZ: boolean; // Pan-Tilt-Zoom
}

export interface DeviceConfiguration {
  alertThreshold: number;
  recordingEnabled: boolean;
  motionDetectionEnabled: boolean;
  objectDetectionEnabled: boolean;
  recordingDuration: number; // seconds
  detectionInterval: number; // milliseconds
  uploadQuality: 'low' | 'medium' | 'high';
  nightVisionEnabled?: boolean;
  audioRecordingEnabled?: boolean;
}

export interface DeviceStatus {
  deviceId: string;
  timestamp: Date;
  status: 'online' | 'offline' | 'error';
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  batteryLevel?: number;
  temperature?: number;
  lastHeartbeat: Date;
  activeDetections: number;
  eventsToday: number;
  errorMessage?: string;
}

function defaultCapabilities(): DeviceCapabilities {
  return {
    hasCamera: false, hasAudio: false, canRecord: false, canStream: false,
    canDetectMotion: false, canDetectObjects: false,
    supportedResolutions: [], supportedFrameRates: [],
    batteryPowered: false, canPTZ: false,
  };
}

function defaultConfiguration(): DeviceConfiguration {
  return {
    alertThreshold: 0.5, recordingEnabled: false,
    motionDetectionEnabled: true, objectDetectionEnabled: true,
    recordingDuration: 30, detectionInterval: 1000, uploadQuality: 'medium',
  };
}

// Device Registry Service
export class DeviceRegistry {
  private devices: Map<string, Device> = new Map();
  private statusMap: Map<string, DeviceStatus> = new Map();
  private idToken: string | null = null;
  // Maps local generated ID → server-persisted ID
  private serverIds: Map<string, string> = new Map();

  /** Provide the MSAL idToken so API calls can be authenticated. */
  setIdToken(token: string): void {
    this.idToken = token;
  }

  async registerDevice(device: Omit<Device, 'id'> & { metadata?: Partial<Device['metadata']> }): Promise<Device> {
    const deviceId = this.generateDeviceId(device);
    const newDevice: Device = {
      ...device,
      id: deviceId,
      metadata: {
        ...device.metadata,
        registeredAt: new Date(),
        lastUpdated: new Date()
      }
    };

    this.devices.set(deviceId, newDevice);
    await this.saveToStorage();
    // Return the server-assigned ID if the upsert succeeded
    const serverId = this.serverIds.get(deviceId) ?? deviceId;
    return this.devices.get(serverId) ?? newDevice;
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private heartbeatDeviceId?: string;

  /** Start sending a heartbeat PATCH every 30 s for the given server device ID. */
  startHeartbeat(serverId: string, token?: string): void {
    if (token) this.idToken = token;
    this.heartbeatDeviceId = serverId;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    void this.sendHeartbeat(); // immediate first ping
    this.heartbeatInterval = setInterval(() => void this.sendHeartbeat(), 30_000);
    window.addEventListener('beforeunload', () => this.stopHeartbeat(), { once: true });
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.idToken && this.heartbeatDeviceId) {
      fetch(`/api/devices/${this.heartbeatDeviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.idToken}` },
        body: JSON.stringify({ status: 'offline' }),
        keepalive: true,
      }).catch(() => {});
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.idToken || !this.heartbeatDeviceId) return;
    try {
      await fetch(`/api/devices/${this.heartbeatDeviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.idToken}` },
        body: JSON.stringify({ status: 'online', lastHeartbeat: new Date() }),
      });
    } catch { /* best-effort */ }
  }

  async updateDeviceStatus(deviceId: string, status: Partial<DeviceStatus>): Promise<void> {
    const existingStatus = this.statusMap.get(deviceId);
    const newStatus: DeviceStatus = {
      deviceId,
      timestamp: new Date(),
      status: 'online',
      lastHeartbeat: new Date(),
      activeDetections: 0,
      eventsToday: 0,
      ...existingStatus,
      ...status
    };

    this.statusMap.set(deviceId, newStatus);
    await this.saveStatusToStorage();
  }

  getDevicesByLocation(location: string): Device[] {
    return Array.from(this.devices.values()).filter(
      device => device.location.name === location
    );
  }

  getDevicesByType(type: Device['type']): Device[] {
    return Array.from(this.devices.values()).filter(
      device => device.type === type
    );
  }

  getOnlineDevices(): Device[] {
    return Array.from(this.devices.values()).filter(device => {
      const status = this.statusMap.get(device.id);
      return status?.status === 'online';
    });
  }

  /**
   * Load previously registered devices from the server into the in-memory registry.
   * Call once on app startup after the MSAL token is available.
   */
  async loadFromServer(idToken: string): Promise<void> {
    this.idToken = idToken;
    try {
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) return;
      const rows: Array<{
        id: string; name: string; type: string; platform: string;
        status: string; location: string; ipAddress: string | null;
        macAddress: string | null; capabilities: string | null;
        configuration: string | null; createdAt: string; updatedAt: string;
        lastSeen: string;
      }> = await res.json();

      for (const row of rows) {
        const device: Device = {
          id: row.id,
          name: row.name,
          type: row.type as Device['type'],
          platform: row.platform,
          status: row.status as Device['status'],
          location: { name: row.location },
          network: {
            ipAddress: row.ipAddress ?? undefined,
            macAddress: row.macAddress ?? undefined,
            lastSeen: new Date(row.lastSeen),
          },
          capabilities: row.capabilities ? JSON.parse(row.capabilities) : defaultCapabilities(),
          configuration: row.configuration ? JSON.parse(row.configuration) : defaultConfiguration(),
          metadata: {
            registeredAt: new Date(row.createdAt),
            lastUpdated: new Date(row.updatedAt),
          },
        };
        this.devices.set(row.id, device);
        // Server ID is the same as the local ID for server-loaded devices
        this.serverIds.set(row.id, row.id);
      }
    } catch {
      // Network unavailable or dev mode — registry stays in-memory only
    }
  }

  private generateDeviceId(device: Partial<Device>): string {
    const prefix = device.type?.slice(0, 3).toUpperCase() || 'DEV';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `${prefix}_${timestamp}_${random}`;
  }

  private async saveToStorage(): Promise<void> {
    if (!this.idToken) return;
    for (const [localId, device] of this.devices.entries()) {
      if (this.serverIds.has(localId)) continue; // already persisted
      try {
        const res = await fetch('/api/devices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.idToken}`,
          },
          body: JSON.stringify({
            name: device.name,
            type: device.type,
            platform: device.platform,
            status: device.status,
            location: device.location.name,
            ipAddress: device.network.ipAddress,
            macAddress: device.network.macAddress,
            capabilities: device.capabilities,
            configuration: device.configuration,
          }),
        });
        if (res.ok) {
          const row = await res.json();
          // Map local ID → server ID; also add device under server ID
          this.serverIds.set(localId, row.id);
          if (localId !== row.id) {
            // Replace in-memory entry with stable server ID
            this.devices.delete(localId);
            this.devices.set(row.id, { ...device, id: row.id });
          }
        }
      } catch {
        // Network unavailable — will retry on next save
      }
    }
  }

  private async saveStatusToStorage(): Promise<void> {
    if (!this.idToken) return;
    for (const [deviceId, status] of this.statusMap.entries()) {
      const serverId = this.serverIds.get(deviceId) ?? deviceId;
      try {
        await fetch(`/api/devices/${serverId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.idToken}`,
          },
          body: JSON.stringify({
            status: status.status,
            lastHeartbeat: status.lastHeartbeat,
          }),
        });
      } catch {
        // Network unavailable — status update is best-effort
      }
    }
  }
}
