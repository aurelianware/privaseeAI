// Platform-Specific Device Adapters
// NOTE: For Autel EVO Lite drone integration, see src/drone/adapters/DroneAdapter.ts
import { SecurityEvent } from './storage';
import { Device, DeviceConfiguration } from './deviceRegistry';

// Base Device Adapter Interface
export interface DeviceAdapter {
  deviceType: Device['type'];
  connect(connectionInfo: any): Promise<boolean>;
  disconnect(): Promise<void>;
  getStatus(): Promise<DeviceStatus>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getEventStream(): AsyncIterable<SecurityEvent>;
  sendCommand(command: DeviceCommand): Promise<CommandResponse>;
  updateConfiguration(config: Partial<DeviceConfiguration>): Promise<void>;
}

export interface DeviceStatus {
  online: boolean;
  lastHeartbeat: Date;
  cpuUsage?: number;
  memoryUsage?: number;
  batteryLevel?: number;
  temperature?: number;
  activeStreams: number;
  eventsToday: number;
  error?: string;
}

export interface DeviceCommand {
  type: 'start_detection' | 'stop_detection' | 'capture_image' | 'start_recording' | 'stop_recording' | 'get_status' | 'reboot';
  parameters?: Record<string, any>;
  timeout?: number;
}

export interface CommandResponse {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

// Raspberry Pi Adapter
export class RaspberryPiAdapter implements DeviceAdapter {
  deviceType: Device['type'] = 'raspberry-pi';
  private websocket?: WebSocket;
  private device?: Device;
  private eventQueue: SecurityEvent[] = [];

  async connect(connectionInfo: { ipAddress: string; port: number; apiKey?: string }): Promise<boolean> {
    try {
      const wsUrl = `ws://${connectionInfo.ipAddress}:${connectionInfo.port}/websocket`;
      this.websocket = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        this.websocket!.onopen = () => {
          console.log('✅ Connected to Raspberry Pi');
          this.setupEventHandlers();
          resolve(true);
        };

        this.websocket!.onerror = (error) => {
          console.error('❌ Raspberry Pi connection failed:', error);
          reject(false);
        };

        setTimeout(() => reject(false), 10000); // 10 second timeout
      });
    } catch (error) {
      console.error('Raspberry Pi connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = undefined;
    }
  }

  async getStatus(): Promise<DeviceStatus> {
    const response = await this.sendCommand({ type: 'get_status' });
    
    if (response.success) {
      return {
        online: true,
        lastHeartbeat: new Date(),
        cpuUsage: response.data?.cpu || 0,
        memoryUsage: response.data?.memory || 0,
        temperature: response.data?.temperature || 0,
        activeStreams: response.data?.streams || 0,
        eventsToday: response.data?.events || 0
      };
    }

    return {
      online: false,
      lastHeartbeat: new Date(),
      activeStreams: 0,
      eventsToday: 0,
      error: response.error
    };
  }

  async startDetection(): Promise<void> {
    const response = await this.sendCommand({ type: 'start_detection' });
    if (!response.success) {
      throw new Error(`Failed to start detection: ${response.error}`);
    }
  }

  async stopDetection(): Promise<void> {
    const response = await this.sendCommand({ type: 'stop_detection' });
    if (!response.success) {
      throw new Error(`Failed to stop detection: ${response.error}`);
    }
  }

  async *getEventStream(): AsyncIterable<SecurityEvent> {
    while (this.websocket?.readyState === WebSocket.OPEN) {
      if (this.eventQueue.length > 0) {
        yield this.eventQueue.shift()!;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }
  }

  async sendCommand(command: DeviceCommand): Promise<CommandResponse> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: 'Device not connected',
        executionTime: 0
      };
    }

    const startTime = Date.now();
    const commandId = `cmd_${Date.now()}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: 'Command timeout',
          executionTime: Date.now() - startTime
        });
      }, command.timeout || 5000);

      // Set up response handler
      const messageHandler = (event: MessageEvent) => {
        const response = JSON.parse(event.data);
        if (response.commandId === commandId) {
          clearTimeout(timeout);
          this.websocket!.removeEventListener('message', messageHandler);
          resolve({
            success: response.success,
            data: response.data,
            error: response.error,
            executionTime: Date.now() - startTime
          });
        }
      };

      this.websocket!.addEventListener('message', messageHandler);

      // Send command
      this.websocket!.send(JSON.stringify({
        ...command,
        commandId
      }));
    });
  }

  async updateConfiguration(config: Partial<DeviceConfiguration>): Promise<void> {
    const response = await this.sendCommand({
      type: 'start_detection', // This would be 'update_config' in real implementation
      parameters: config
    });

    if (!response.success) {
      throw new Error(`Failed to update configuration: ${response.error}`);
    }
  }

  private setupEventHandlers(): void {
    if (!this.websocket) return;

    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'security_event') {
          const securityEvent: SecurityEvent = {
            id: data.id || `rpi_${Date.now()}`,
            timestamp: new Date(data.timestamp),
            type: data.eventType || 'detection',
            detections: data.detections || [],
            confidence: data.confidence || 0,
            metadata: {
              deviceId: this.device?.id || 'unknown',
              location: this.device?.location.name,
              cameraId: data.cameraId || 'rpi_camera',
              duration: data.duration
            },
            synced: false,
            syncAttempts: 0
          };

          this.eventQueue.push(securityEvent);
        }
      } catch (error) {
        console.error('Failed to parse Raspberry Pi message:', error);
      }
    };
  }
}

// Mobile iOS Adapter
export class MobileIOSAdapter implements DeviceAdapter {
  deviceType: Device['type'] = 'mobile-ios';
  private connection?: any; // Would be a native bridge in real implementation

  async connect(connectionInfo: { deviceId: string; authToken?: string }): Promise<boolean> {
    try {
      // In a real iOS app, this would use native bridge communication
      console.log('📱 Connecting to iOS device...');
      
      // Simulate connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.connection = {
        deviceId: connectionInfo.deviceId,
        connected: true,
        lastHeartbeat: new Date()
      };

      return true;
    } catch (error) {
      console.error('iOS connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connection = undefined;
  }

  async getStatus(): Promise<DeviceStatus> {
    if (!this.connection) {
      return {
        online: false,
        lastHeartbeat: new Date(),
        activeStreams: 0,
        eventsToday: 0,
        error: 'Not connected'
      };
    }

    return {
      online: true,
      lastHeartbeat: new Date(),
      batteryLevel: Math.floor(Math.random() * 100), // Mock battery level
      activeStreams: 1,
      eventsToday: Math.floor(Math.random() * 20)
    };
  }

  async startDetection(): Promise<void> {
    if (!this.connection) {
      throw new Error('Device not connected');
    }
    console.log('📱 Starting iOS detection...');
    // Native bridge call would go here
  }

  async stopDetection(): Promise<void> {
    if (!this.connection) {
      throw new Error('Device not connected');
    }
    console.log('📱 Stopping iOS detection...');
    // Native bridge call would go here
  }

  async *getEventStream(): AsyncIterable<SecurityEvent> {
    // In a real implementation, this would listen to native events
    while (this.connection?.connected) {
      // Simulate periodic events
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (Math.random() > 0.7) { // 30% chance of event
        yield this.createMockEvent();
      }
    }
  }

  async sendCommand(command: DeviceCommand): Promise<CommandResponse> {
    if (!this.connection) {
      return {
        success: false,
        error: 'Device not connected',
        executionTime: 0
      };
    }

    const startTime = Date.now();
    
    // Simulate command execution
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      data: { message: `Command ${command.type} executed on iOS` },
      executionTime: Date.now() - startTime
    };
  }

  async updateConfiguration(config: Partial<DeviceConfiguration>): Promise<void> {
    console.log('📱 Updating iOS configuration:', config);
    // Native bridge call would go here
  }

  private createMockEvent(): SecurityEvent {
    return {
      id: `ios_${Date.now()}`,
      timestamp: new Date(),
      type: 'detection',
      detections: [
        {
          bbox: [100, 100, 200, 200],
          className: 'person',
          classId: 0,
          score: 0.85 + Math.random() * 0.15
        }
      ],
      confidence: 0.85,
      metadata: {
        deviceId: this.connection?.deviceId || 'ios_unknown',
        location: 'Mobile Device',
        cameraId: 'ios_camera'
      },
      synced: false,
      syncAttempts: 0
    };
  }
}

// IP Camera Adapter
export class IPCameraAdapter implements DeviceAdapter {
  deviceType: Device['type'] = 'ip-camera';
  private rtspStream?: any;
  private httpClient?: any;

  async connect(connectionInfo: { 
    ipAddress: string; 
    username?: string; 
    password?: string;
    rtspPort?: number;
    httpPort?: number;
  }): Promise<boolean> {
    try {
      console.log('📹 Connecting to IP Camera...');
      
      // Test HTTP connection first
      const httpUrl = `http://${connectionInfo.ipAddress}:${connectionInfo.httpPort || 80}`;
      // In real implementation, make HTTP request to test connection
      
      // Test RTSP stream
      const rtspUrl = `rtsp://${connectionInfo.ipAddress}:${connectionInfo.rtspPort || 554}/stream`;
      // In real implementation, connect to RTSP stream
      
      this.httpClient = { 
        baseUrl: httpUrl,
        auth: { username: connectionInfo.username, password: connectionInfo.password }
      };
      this.rtspStream = { url: rtspUrl, connected: true };

      return true;
    } catch (error) {
      console.error('IP Camera connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.httpClient = undefined;
    this.rtspStream = undefined;
  }

  async getStatus(): Promise<DeviceStatus> {
    if (!this.httpClient) {
      return {
        online: false,
        lastHeartbeat: new Date(),
        activeStreams: 0,
        eventsToday: 0,
        error: 'Not connected'
      };
    }

    return {
      online: true,
      lastHeartbeat: new Date(),
      activeStreams: this.rtspStream ? 1 : 0,
      eventsToday: Math.floor(Math.random() * 50)
    };
  }

  async startDetection(): Promise<void> {
    console.log('📹 Starting IP Camera detection...');
    // Enable motion detection on camera
  }

  async stopDetection(): Promise<void> {
    console.log('📹 Stopping IP Camera detection...');
    // Disable motion detection on camera
  }

  async *getEventStream(): AsyncIterable<SecurityEvent> {
    while (this.rtspStream?.connected) {
      // In real implementation, process RTSP frames for motion/objects
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (Math.random() > 0.8) { // 20% chance of event
        yield this.createMockEvent();
      }
    }
  }

  async sendCommand(command: DeviceCommand): Promise<CommandResponse> {
    if (!this.httpClient) {
      return {
        success: false,
        error: 'Device not connected',
        executionTime: 0
      };
    }

    const startTime = Date.now();
    
    // Simulate HTTP API call to camera
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      success: true,
      data: { message: `Command ${command.type} sent to IP camera` },
      executionTime: Date.now() - startTime
    };
  }

  async updateConfiguration(config: Partial<DeviceConfiguration>): Promise<void> {
    console.log('📹 Updating IP Camera configuration:', config);
    // Send configuration via HTTP API
  }

  private createMockEvent(): SecurityEvent {
    return {
      id: `ipcam_${Date.now()}`,
      timestamp: new Date(),
      type: 'motion',
      detections: [
        {
          bbox: [150, 150, 250, 250],
          className: 'car',
          classId: 2,
          score: 0.75 + Math.random() * 0.25
        }
      ],
      confidence: 0.75,
      metadata: {
        deviceId: 'ipcam_device',
        location: 'Front Door',
        cameraId: 'ip_camera_main'
      },
      synced: false,
      syncAttempts: 0
    };
  }
}

// Adapter Factory
export class DeviceAdapterFactory {
  private static adapters: Map<Device['type'], new () => DeviceAdapter> = new Map();

  static {
    // Initialize adapters
    this.adapters.set('raspberry-pi', RaspberryPiAdapter);
    this.adapters.set('mobile-ios', MobileIOSAdapter);
    this.adapters.set('ip-camera', IPCameraAdapter);
  }

  static createAdapter(deviceType: Device['type']): DeviceAdapter | null {
    const AdapterClass = this.adapters.get(deviceType);
    if (!AdapterClass) {
      console.error(`No adapter available for device type: ${deviceType}`);
      return null;
    }

    return new AdapterClass();
  }

  static getSupportedDeviceTypes(): Device['type'][] {
    return Array.from(this.adapters.keys());
  }

  static registerAdapter(deviceType: Device['type'], adapterClass: new () => DeviceAdapter): void {
    this.adapters.set(deviceType, adapterClass);
  }
}