// Drone Configuration Management
import { DroneConfig } from '../types';

/**
 * Default drone configuration
 */
const DEFAULT_CONFIG: DroneConfig = {
  connectionSettings: {
    host: process.env.DRONE_HOST || 'localhost',
    port: parseInt(process.env.DRONE_PORT || '8889', 10),
    protocol: (process.env.DRONE_PROTOCOL as 'tcp' | 'udp' | 'websocket') || 'tcp',
    apiKey: process.env.DRONE_API_KEY,
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  flightSettings: {
    maxSpeed: parseFloat(process.env.DRONE_MAX_SPEED || '15'), // m/s
    maxAltitude: parseFloat(process.env.DRONE_MAX_ALTITUDE || '120'), // meters
    maxDistance: parseFloat(process.env.DRONE_MAX_DISTANCE || '500'), // meters
    returnHomeAltitude: parseFloat(process.env.DRONE_RTH_ALTITUDE || '30'), // meters
    lowBatteryWarning: 30, // percentage
    criticalBatteryLevel: 15, // percentage
    enableObstacleAvoidance: true,
  },
  cameraSettings: {
    defaultPhotoFormat: 'jpeg',
    defaultVideoFormat: 'mp4',
    defaultVideoResolution: '4k',
    autoRecordOnTakeoff: false,
  },
  privacySettings: {
    enableLocalStorage: true,
    encryptFlightLogs: true,
    autoDeleteAfterDays: 30,
    requireAuthForAccess: true,
  },
};

/**
 * DroneConfigManager - Manages drone configuration with validation
 */
export class DroneConfigManager {
  private config: DroneConfig;
  private static instance: DroneConfigManager;

  private constructor(customConfig?: Partial<DroneConfig>) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, customConfig);
    this.validateConfig();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(customConfig?: Partial<DroneConfig>): DroneConfigManager {
    if (!DroneConfigManager.instance) {
      DroneConfigManager.instance = new DroneConfigManager(customConfig);
    }
    return DroneConfigManager.instance;
  }

  /**
   * Get current configuration
   */
  public getConfig(): DroneConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<DroneConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.validateConfig();
  }

  /**
   * Get connection settings
   */
  public getConnectionSettings() {
    return { ...this.config.connectionSettings };
  }

  /**
   * Get flight settings
   */
  public getFlightSettings() {
    return { ...this.config.flightSettings };
  }

  /**
   * Get camera settings
   */
  public getCameraSettings() {
    return { ...this.config.cameraSettings };
  }

  /**
   * Get privacy settings
   */
  public getPrivacySettings() {
    return { ...this.config.privacySettings };
  }

  /**
   * Merge configurations with deep merge for nested objects
   */
  private mergeConfig(base: DroneConfig, updates?: Partial<DroneConfig>): DroneConfig {
    if (!updates) return base;

    return {
      connectionSettings: {
        ...base.connectionSettings,
        ...updates.connectionSettings,
      },
      flightSettings: {
        ...base.flightSettings,
        ...updates.flightSettings,
      },
      cameraSettings: {
        ...base.cameraSettings,
        ...updates.cameraSettings,
      },
      privacySettings: {
        ...base.privacySettings,
        ...updates.privacySettings,
      },
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    const { connectionSettings, flightSettings } = this.config;

    // Validate connection settings
    if (!connectionSettings.host) {
      throw new Error('Drone host is required');
    }

    if (connectionSettings.port < 1 || connectionSettings.port > 65535) {
      throw new Error('Invalid port number. Must be between 1 and 65535');
    }

    if (connectionSettings.timeout < 1000) {
      throw new Error('Connection timeout must be at least 1000ms');
    }

    if (connectionSettings.retryAttempts < 0) {
      throw new Error('Retry attempts cannot be negative');
    }

    // Validate flight settings
    if (flightSettings.maxSpeed <= 0 || flightSettings.maxSpeed > 20) {
      throw new Error('Max speed must be between 0 and 20 m/s');
    }

    if (flightSettings.maxAltitude <= 0 || flightSettings.maxAltitude > 500) {
      throw new Error('Max altitude must be between 0 and 500 meters');
    }

    if (flightSettings.maxDistance <= 0) {
      throw new Error('Max distance must be positive');
    }

    if (flightSettings.lowBatteryWarning <= flightSettings.criticalBatteryLevel) {
      throw new Error('Low battery warning must be higher than critical battery level');
    }

    if (flightSettings.criticalBatteryLevel < 5) {
      throw new Error('Critical battery level should be at least 5%');
    }
  }

  /**
   * Load configuration from environment variables
   */
  public static loadFromEnvironment(): DroneConfigManager {
    return DroneConfigManager.getInstance();
  }

  /**
   * Export configuration to JSON
   */
  public toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Load configuration from JSON
   */
  public static fromJSON(json: string): DroneConfigManager {
    try {
      const config = JSON.parse(json) as DroneConfig;
      return new DroneConfigManager(config);
    } catch (error) {
      throw new Error(`Failed to parse configuration JSON: ${error}`);
    }
  }
}

/**
 * Helper function to get drone configuration
 */
export function getDroneConfig(customConfig?: Partial<DroneConfig>): DroneConfig {
  return DroneConfigManager.getInstance(customConfig).getConfig();
}

/**
 * Helper function to update drone configuration
 */
export function updateDroneConfig(updates: Partial<DroneConfig>): void {
  DroneConfigManager.getInstance().updateConfig(updates);
}
