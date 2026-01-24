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

// Device Registry Service
export class DeviceRegistry {
  private devices: Map<string, Device> = new Map();
  private statusMap: Map<string, DeviceStatus> = new Map();

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
    return newDevice;
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

  private generateDeviceId(device: Partial<Device>): string {
    const prefix = device.type?.slice(0, 3).toUpperCase() || 'DEV';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `${prefix}_${timestamp}_${random}`;
  }

  private async saveToStorage(): Promise<void> {
    // Save to IndexedDB or cloud storage
    // Implementation depends on your storage strategy
  }

  private async saveStatusToStorage(): Promise<void> {
    // Save device status updates
  }
}