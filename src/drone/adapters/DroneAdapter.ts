// Drone Adapter - Integration with privaseeAI device system
import { DeviceAdapter, DeviceStatus, DeviceCommand, CommandResponse } from '../../utils/deviceAdapters';
import { Device, DeviceConfiguration } from '../../utils/deviceRegistry';
import { SecurityEvent } from '../../utils/storage';
import { DroneController } from '../control/DroneController';
import { DroneEventEmitter } from '../events/EventEmitter';
import { FlightLogger } from '../logger/FlightLogger';

/**
 * Drone connection configuration
 */
export interface DroneConnectionInfo {
  host: string;
  port: number;
  apiKey?: string;
  droneId: string;
}

/**
 * DroneAdapter - Adapts Autel EVO Lite drone to privaseeAI device system
 */
export class DroneAdapter implements DeviceAdapter {
  deviceType: Device['type'] = 'drone';
  
  private controller: DroneController | null = null;
  private eventEmitter: DroneEventEmitter;
  private logger: FlightLogger;
  private device?: Device;
  private isDetectionActive = false;
  private detectionInterval?: ReturnType<typeof setInterval>;
  private eventSubscriptions: string[] = []; // Track subscription IDs for cleanup

  constructor() {
    this.eventEmitter = DroneEventEmitter.getInstance();
    this.logger = FlightLogger.getInstance();
  }

  /**
   * Connect to drone
   */
  async connect(connectionInfo: DroneConnectionInfo): Promise<boolean> {
    try {
      this.logger.info('DRONE_ADAPTER', `Connecting to drone: ${connectionInfo.droneId}`);

      // Create drone controller
      this.controller = new DroneController(connectionInfo.droneId);

      // Connect to drone
      const connected = await this.controller.connect({
        host: connectionInfo.host,
        port: connectionInfo.port,
        apiKey: connectionInfo.apiKey,
      });

      if (connected) {
        // Set up event listeners
        this.setupEventListeners(connectionInfo.droneId);

        // Emit connection event
        await this.eventEmitter.emitConnectionChanged(
          connectionInfo.droneId,
          'connected'
        );

        this.logger.info('DRONE_ADAPTER', `Successfully connected to drone: ${connectionInfo.droneId}`);
      }

      return connected;
    } catch (error) {
      this.logger.error('DRONE_ADAPTER', `Failed to connect to drone: ${error}`);
      return false;
    }
  }

  /**
   * Disconnect from drone
   */
  async disconnect(): Promise<void> {
    if (!this.controller) {
      return;
    }

    try {
      const droneId = this.controller.getDroneId();
      
      // Stop detection if active
      if (this.isDetectionActive) {
        await this.stopDetection();
      }

      // Clean up event subscriptions
      this.cleanupEventListeners();

      // Disconnect controller
      await this.controller.disconnect();

      // Emit disconnection event
      await this.eventEmitter.emitConnectionChanged(droneId, 'disconnected');

      // Clean up
      this.controller = null;
      
      this.logger.info('DRONE_ADAPTER', `Disconnected from drone: ${droneId}`);
    } catch (error) {
      this.logger.error('DRONE_ADAPTER', `Error during disconnect: ${error}`);
      throw error;
    }
  }

  /**
   * Get device status
   */
  async getStatus(): Promise<DeviceStatus> {
    if (!this.controller) {
      return {
        online: false,
        lastHeartbeat: new Date(),
        activeStreams: 0,
        eventsToday: 0,
        error: 'Not connected',
      };
    }

    const telemetry = this.controller.getTelemetry();
    const isConnected = this.controller.isConnected();

    return {
      online: isConnected,
      lastHeartbeat: new Date(),
      batteryLevel: telemetry?.battery.percentage,
      temperature: telemetry?.battery.temperature,
      activeStreams: telemetry?.isFlying ? 1 : 0,
      eventsToday: 0, // Could be tracked separately
      cpuUsage: 0, // Not applicable for drones
      memoryUsage: 0, // Not applicable for drones
    };
  }

  /**
   * Start detection (surveillance mode)
   */
  async startDetection(): Promise<void> {
    if (!this.controller) {
      throw new Error('Drone not connected');
    }

    if (this.isDetectionActive) {
      this.logger.warn('DRONE_ADAPTER', 'Detection already active');
      return;
    }

    this.logger.info('DRONE_ADAPTER', `Starting detection mode for drone: ${this.controller.getDroneId()}`);

    this.isDetectionActive = true;

    // Start video recording
    await this.controller.startRecording();

    // Set up periodic telemetry monitoring for events
    this.detectionInterval = setInterval(() => {
      this.checkForEvents();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop detection
   */
  async stopDetection(): Promise<void> {
    if (!this.controller) {
      throw new Error('Drone not connected');
    }

    if (!this.isDetectionActive) {
      return;
    }

    this.logger.info('DRONE_ADAPTER', `Stopping detection mode for drone: ${this.controller.getDroneId()}`);

    this.isDetectionActive = false;

    // Stop video recording
    await this.controller.stopRecording();

    // Clear detection interval
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = undefined;
    }
  }

  /**
   * Get event stream (async generator)
   */
  async* getEventStream(): AsyncIterable<SecurityEvent> {
    // This would be implemented to stream security events from the drone
    // For now, it's a placeholder that yields events from telemetry monitoring
    
    while (this.isDetectionActive && this.controller) {
      const telemetry = this.controller.getTelemetry();
      
      if (telemetry) {
        // Convert telemetry to security event if needed
        // This is a simplified example
        const event: SecurityEvent = {
          id: `drone-event-${Date.now()}`,
          timestamp: new Date(),
          type: 'detection',
          detections: [],
          confidence: 0.9,
          metadata: {
            deviceId: this.controller.getDroneId(),
            cameraId: 'drone-camera',
            location: `${telemetry.position.latitude},${telemetry.position.longitude}`,
          },
          synced: false,
          syncAttempts: 0,
        };

        yield event;
      }

      // Wait before next yield
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Send command to drone
   */
  async sendCommand(command: DeviceCommand): Promise<CommandResponse> {
    if (!this.controller) {
      return {
        success: false,
        error: 'Drone not connected',
        executionTime: 0,
      };
    }

    const startTime = Date.now();

    try {
      let result: any;

      switch (command.type) {
        case 'start_detection':
          await this.startDetection();
          result = { status: 'detection_started' };
          break;

        case 'stop_detection':
          await this.stopDetection();
          result = { status: 'detection_stopped' };
          break;

        case 'capture_image':
          result = await this.controller.takePhoto();
          break;

        case 'start_recording':
          result = await this.controller.startRecording();
          break;

        case 'stop_recording':
          result = await this.controller.stopRecording();
          break;

        case 'get_status':
          result = await this.getStatus();
          break;

        default:
          // Custom drone commands
          if (command.parameters?.droneCommand) {
            const droneCmd = command.parameters.droneCommand;
            result = await this.controller.executeCommand(droneCmd);
          } else {
            throw new Error(`Unknown command type: ${command.type}`);
          }
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error('DRONE_ADAPTER', `Command failed: ${error}`);

      return {
        success: false,
        error: String(error),
        executionTime,
      };
    }
  }

  /**
   * Update device configuration
   */
  async updateConfiguration(config: Partial<DeviceConfiguration>): Promise<void> {
    this.logger.info('DRONE_ADAPTER', 'Updating device configuration', config);
    
    // Update device configuration
    // This would integrate with the DroneConfigManager
    
    if (this.device) {
      Object.assign(this.device.configuration, config);
    }
  }

  /**
   * Set up event listeners for drone events
   */
  private setupEventListeners(droneId: string): void {
    // Listen for telemetry updates
    const telemetryId = this.eventEmitter.onTelemetryUpdate(async (event) => {
      // Could forward telemetry to privaseeAI storage system
      this.logger.debug('DRONE_ADAPTER', 'Telemetry update received', event.data);
    }, droneId);
    this.eventSubscriptions.push(telemetryId);

    // Listen for low battery
    const lowBatteryId = this.eventEmitter.onLowBattery(async (event) => {
      this.logger.warn('DRONE_ADAPTER', `Low battery warning: ${event.data.percentage}%`, undefined, droneId);
    }, droneId);
    this.eventSubscriptions.push(lowBatteryId);

    // Listen for errors
    const errorId = this.eventEmitter.onError(async (event) => {
      this.logger.error('DRONE_ADAPTER', `Drone error: ${event.data.message}`, event.data, droneId);
    }, droneId);
    this.eventSubscriptions.push(errorId);

    // Listen for obstacle detection
    const obstacleId = this.eventEmitter.onObstacleDetected(async (event) => {
      this.logger.warn('DRONE_ADAPTER', `Obstacle detected: ${event.data.direction} at ${event.data.distance}m`, undefined, droneId);
    }, droneId);
    this.eventSubscriptions.push(obstacleId);
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {
    for (const subscriptionId of this.eventSubscriptions) {
      this.eventEmitter.off(subscriptionId);
    }
    this.eventSubscriptions = [];
  }

  /**
   * Check for events during detection
   */
  private async checkForEvents(): Promise<void> {
    if (!this.controller) {
      return;
    }

    const telemetry = this.controller.getTelemetry();

    if (!telemetry) {
      return;
    }

    // Check for low battery
    if (telemetry.battery.percentage <= 30 && telemetry.battery.percentage > 15) {
      await this.eventEmitter.emitLowBattery(
        this.controller.getDroneId(),
        telemetry.battery.percentage
      );
    }

    // Check for critical battery
    if (telemetry.battery.percentage <= 15) {
      await this.eventEmitter.emitCriticalBattery(
        this.controller.getDroneId(),
        telemetry.battery.percentage
      );
    }

    // Emit telemetry update
    await this.eventEmitter.emitTelemetryUpdate(
      this.controller.getDroneId(),
      telemetry
    );
  }
}

/**
 * Helper function to create drone adapter
 */
export function createDroneAdapter(): DroneAdapter {
  return new DroneAdapter();
}
