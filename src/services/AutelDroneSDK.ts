/**
 * Autel EVO Lite 640T Drone SDK Wrapper
 * 
 * This class provides a TypeScript wrapper around the Autel Mobile SDK
 * for the EVO Lite 640T drone, including thermal imaging capabilities.
 * 
 * @class AutelDroneSDK
 * @version 1.0.0
 */

// ==================== Interfaces ====================

/**
 * Connection configuration options
 */
export interface ConnectionConfig {
  /** Connection type: WiFi or Remote Controller */
  connectionType: 'wifi' | 'remote-controller';
  /** WiFi SSID (required for WiFi connection) */
  ssid?: string;
  /** WiFi password (required for WiFi connection) */
  password?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Battery status information
 */
export interface BatteryStatus {
  /** Battery percentage (0-100) */
  percentage: number;
  /** Voltage in volts */
  voltage: number;
  /** Current in amperes */
  current: number;
  /** Temperature in Celsius */
  temperature: number;
  /** Remaining flight time in minutes */
  remainingFlightTime: number;
  /** Battery health status */
  health: 'good' | 'warning' | 'critical';
  /** Number of charge cycles */
  cycleCount: number;
}

/**
 * GPS status and location information
 */
export interface GPSStatus {
  /** GPS signal strength (0-5) */
  signalStrength: number;
  /** Number of satellites connected */
  satelliteCount: number;
  /** GPS fix status */
  fixStatus: 'no-fix' | '2d-fix' | '3d-fix' | 'dgps-fix';
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude in meters (above sea level) */
  altitude: number;
  /** Horizontal accuracy in meters */
  horizontalAccuracy: number;
  /** Vertical accuracy in meters */
  verticalAccuracy: number;
}

/**
 * Sensor status information
 */
export interface SensorStatus {
  /** IMU (Inertial Measurement Unit) status */
  imu: {
    calibrated: boolean;
    gyroscope: { x: number; y: number; z: number };
    accelerometer: { x: number; y: number; z: number };
  };
  /** Compass status */
  compass: {
    calibrated: boolean;
    heading: number;
    interference: 'none' | 'low' | 'medium' | 'high';
  };
  /** Barometer status */
  barometer: {
    operational: boolean;
    pressure: number;
    altitude: number;
  };
  /** Vision sensors status */
  visionSensors: {
    forward: boolean;
    backward: boolean;
    downward: boolean;
    upward: boolean;
  };
  /** Infrared sensors status */
  infraredSensors: {
    front: boolean;
    rear: boolean;
  };
}

/**
 * Complete drone status
 */
export interface DroneStatus {
  /** Connection status */
  connected: boolean;
  /** Flight mode */
  flightMode: 'manual' | 'gps' | 'sport' | 'tripod' | 'waypoint' | 'return-to-home';
  /** Whether drone is flying */
  isFlying: boolean;
  /** Battery status */
  battery: BatteryStatus;
  /** GPS status */
  gps: GPSStatus;
  /** Sensor status */
  sensors: SensorStatus;
  /** Current velocity (m/s) */
  velocity: { x: number; y: number; z: number };
  /** Current altitude (meters) */
  altitude: number;
  /** Wind speed (m/s) */
  windSpeed: number;
  /** Error codes if any */
  errors: string[];
  /** Warning messages if any */
  warnings: string[];
}

/**
 * Waypoint coordinates
 */
export interface Waypoint {
  /** Waypoint index */
  index: number;
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude in meters (relative to takeoff point) */
  altitude: number;
  /** Speed at this waypoint (m/s) */
  speed?: number;
  /** Heading at this waypoint (degrees, 0-360) */
  heading?: number;
  /** Action to perform at waypoint */
  action?: 'none' | 'hover' | 'take-photo' | 'start-recording' | 'stop-recording';
  /** Hover time in seconds (if action is 'hover') */
  hoverTime?: number;
}

/**
 * Waypoint mission configuration
 */
export interface WaypointMission {
  /** Mission name/identifier */
  name: string;
  /** Array of waypoints */
  waypoints: Waypoint[];
  /** Flight speed (m/s) */
  flightSpeed: number;
  /** Action after mission completion */
  finishAction: 'hover' | 'return-to-home' | 'land' | 'continue';
  /** Maximum flight speed (m/s) */
  maxFlightSpeed?: number;
  /** Auto flight speed range (m/s) */
  autoFlightSpeed?: number;
  /** Heading mode */
  headingMode?: 'auto' | 'manual' | 'waypoint' | 'toward-point-of-interest';
  /** Repeat mission count (0 for infinite) */
  repeatCount?: number;
}

/** Mission template types */
export type MissionTemplate = 'patrol' | 'investigate' | 'perimeter';

/** Describes a no-fly polygon (simple) */
export interface NoFlyZone {
  name: string;
  vertices: Array<{ latitude: number; longitude: number }>;
  minAltitude?: number;
  maxAltitude?: number;
}

/** Spherical obstacle for quick exclusion checks */
export interface Obstacle {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  heightMeters?: number;
}

/** Input parameters for mission planning */
export interface MissionPlanningInput {
  template: MissionTemplate;
  threatLocation: { latitude: number; longitude: number };
  currentLocation?: { latitude: number; longitude: number; altitude?: number };
  homeLocation?: { latitude: number; longitude: number; altitude?: number };
  cruiseAltitude: number;
  cruiseSpeed: number;
  orbitRadiusMeters?: number;
  orbitPoints?: number;
  noFlyZones?: NoFlyZone[];
  obstacles?: Obstacle[];
  maxDistanceMeters?: number;
}

/** Mission planning result */
export interface MissionPlanResult {
  mission: WaypointMission;
  totalDistanceMeters: number;
  estimatedFlightMinutes: number;
  requiredBatteryMah: number;
  warnings: string[];
}

/** Pre-flight validation result */
export interface PreFlightCheckResult {
  ok: boolean;
  reasons: string[];
  details: Record<string, { ok: boolean; value?: unknown; message?: string }>;
}

/**
 * Camera stream configuration
 */
export interface CameraStreamConfig {
  /** Camera type */
  cameraType: 'visual' | 'thermal' | 'both';
  /** Stream resolution */
  resolution: '720p' | '1080p' | '4k';
  /** Frame rate */
  frameRate: 30 | 60;
  /** Bitrate in Mbps */
  bitrate?: number;
  /** Enable stream recording */
  enableRecording?: boolean;
}

/**
 * Thermal camera settings
 */
export interface ThermalCameraSettings {
  /** Color palette for thermal imaging */
  palette: 'white-hot' | 'black-hot' | 'rainbow' | 'iron-red' | 'lava';
  /** Temperature unit */
  temperatureUnit: 'celsius' | 'fahrenheit';
  /** Emissivity value (0.1-1.0) */
  emissivity: number;
  /** Enable isotherms */
  enableIsotherms: boolean;
  /** Isotherm temperature range */
  isothermRange?: { min: number; max: number };
}

/**
 * Camera frame data
 */
export interface CameraFrame {
  /** Frame timestamp */
  timestamp: number;
  /** Frame data (base64 encoded or buffer) */
  data: string | ArrayBuffer;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Camera type */
  cameraType: 'visual' | 'thermal';
  /** Thermal data (if thermal camera) */
  thermalData?: {
    minTemperature: number;
    maxTemperature: number;
    avgTemperature: number;
  };
}

/**
 * Command retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial retry delay in milliseconds */
  initialDelay: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay between retries */
  maxDelay: number;
}

/**
 * Event callback types
 */
export type DroneEventCallback = (status: DroneStatus) => void;
export type CameraFrameCallback = (frame: CameraFrame) => void;
export type ConnectionEventCallback = (connected: boolean) => void;
export type ErrorEventCallback = (error: Error) => void;
export type MissionEventType = 'mission-started' | 'waypoint-reached' | 'mission-complete' | 'mission-error';
export interface MissionEvent {
  type: MissionEventType;
  mission: WaypointMission;
  waypointIndex?: number;
  error?: string;
}
export type MissionEventCallback = (event: MissionEvent) => void;

// ==================== Main SDK Class ====================

/**
 * Autel EVO Lite 640T Drone SDK Wrapper
 * 
 * Provides a comprehensive TypeScript interface for controlling the Autel EVO Lite 640T drone,
 * including connection management, flight control, waypoint missions, and thermal imaging.
 * 
 * @example
 * ```typescript
 * const drone = new AutelDroneSDK();
 * 
 * await drone.connect({
 *   connectionType: 'wifi',
 *   ssid: 'EVO-Lite-640T',
 *   password: 'password123'
 * });
 * 
 * const status = await drone.getStatus();
 * console.log(`Battery: ${status.battery.percentage}%`);
 * 
 * await drone.takeoff();
 * ```
 */
export class AutelDroneSDK {
  private connected: boolean = false;
  private connecting: boolean = false;
  private connectionConfig: ConnectionConfig | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  private statusCallbacks: Set<DroneEventCallback> = new Set();
  private cameraCallbacks: Set<CameraFrameCallback> = new Set();
  private connectionCallbacks: Set<ConnectionEventCallback> = new Set();
  private errorCallbacks: Set<ErrorEventCallback> = new Set();
  private missionEventCallbacks: Set<MissionEventCallback> = new Set();
  
  private currentMission: WaypointMission | null = null;
  private currentWaypointIndex: number = 0;
  private missionPaused: boolean = false;
  private missionProgressTimer: NodeJS.Timeout | null = null;
  
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000
  };

  /**
   * Creates a new instance of the Autel Drone SDK wrapper
   */
  constructor() {
    // Initialize SDK
    this.initializeSDK();
  }

  // ==================== Connection Management ====================

  /**
   * Initializes the Autel Mobile SDK
   * 
   * @private
   */
  private async initializeSDK(): Promise<void> {
    try {
      // Initialize the native Autel SDK
      // This would call the actual SDK initialization
      console.log('Autel SDK initialized');
    } catch (error) {
      this.handleError(new Error(`SDK initialization failed: ${error}`));
    }
  }

  /**
   * Connects to the drone via WiFi or remote controller
   * 
   * @param config - Connection configuration options
   * @returns Promise that resolves when connection is established
   * @throws Error if connection fails after all retry attempts
   * 
   * @example
   * ```typescript
   * await drone.connect({
   *   connectionType: 'wifi',
   *   ssid: 'EVO-Lite-640T',
   *   password: 'password123',
   *   timeout: 30000,
   *   autoReconnect: true
   * });
   * ```
   */
  public async connect(config: ConnectionConfig): Promise<void> {
    if (this.connected) {
      console.warn('Already connected to drone');
      return;
    }

    if (this.connecting) {
      throw new Error('Connection already in progress');
    }

    this.connecting = true;
    this.connectionConfig = {
      timeout: 30000,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      ...config
    };

    try {
      await this.executeWithRetry(
        async () => {
          if (config.connectionType === 'wifi') {
            await this.connectViaWiFi(config.ssid!, config.password!);
          } else {
            await this.connectViaRemoteController();
          }
        },
        {
          ...this.defaultRetryConfig,
          maxRetries: 3
        }
      );

      this.connected = true;
      this.reconnectAttempts = 0;
      this.notifyConnectionChange(true);
      
      // Start status monitoring
      this.startStatusMonitoring();
      
      console.log(`Connected to drone via ${config.connectionType}`);
    } catch (error) {
      this.handleError(new Error(`Connection failed: ${error}`));
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Connects to drone via WiFi
   * 
   * @private
   * @param ssid - WiFi network SSID
   * @param password - WiFi network password
   */
  private async connectViaWiFi(ssid: string, password: string): Promise<void> {
    // Simulate WiFi connection to drone
    // In actual implementation, this would call the Autel SDK WiFi connection method
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% success rate for simulation
          resolve();
        } else {
          reject(new Error('WiFi connection timeout'));
        }
      }, 2000);
    });
  }

  /**
   * Connects to drone via remote controller
   * 
   * @private
   */
  private async connectViaRemoteController(): Promise<void> {
    // Simulate remote controller connection
    // In actual implementation, this would call the Autel SDK RC connection method
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.05) { // 95% success rate for simulation
          resolve();
        } else {
          reject(new Error('Remote controller not found'));
        }
      }, 1500);
    });
  }

  /**
   * Disconnects from the drone
   * 
   * @returns Promise that resolves when disconnection is complete
   * 
   * @example
   * ```typescript
   * await drone.disconnect();
   * ```
   */
  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      // Stop any active missions
      if (this.currentMission) {
        await this.stopMission();
      }

      // Stop camera streams
      await this.stopCameraStream();

      // Clear reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Disconnect from SDK
      // In actual implementation, call Autel SDK disconnect method
      
      this.connected = false;
      this.notifyConnectionChange(false);
      
      console.log('Disconnected from drone');
    } catch (error) {
      this.handleError(new Error(`Disconnect failed: ${error}`));
      throw error;
    }
  }

  /**
   * Checks if drone is currently connected
   * 
   * @returns True if connected, false otherwise
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Attempts to reconnect to the drone
   * 
   * @private
   */
  private async attemptReconnect(): Promise<void> {
    if (!this.connectionConfig?.autoReconnect || this.connecting) {
      return;
    }

    if (this.reconnectAttempts >= (this.connectionConfig.maxReconnectAttempts || 5)) {
      console.error('Maximum reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnection attempt ${this.reconnectAttempts}...`);

    try {
      await this.connect(this.connectionConfig);
    } catch (error) {
      console.error(`Reconnection failed: ${error}`);
      
      // Schedule next reconnect attempt with exponential backoff
      const delay = Math.min(
        this.defaultRetryConfig.initialDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.defaultRetryConfig.maxDelay
      );

      this.reconnectTimer = setTimeout(() => {
        this.attemptReconnect();
      }, delay);
    }
  }

  // ==================== Status Monitoring ====================

  /**
   * Gets the current drone status
   * 
   * @returns Promise resolving to current drone status
   * @throws Error if not connected or status retrieval fails
   * 
   * @example
   * ```typescript
   * const status = await drone.getStatus();
   * console.log(`Battery: ${status.battery.percentage}%`);
   * console.log(`GPS Satellites: ${status.gps.satelliteCount}`);
   * console.log(`Altitude: ${status.altitude}m`);
   * ```
   */
  public async getStatus(): Promise<DroneStatus> {
    this.ensureConnected();

    try {
      // In actual implementation, retrieve status from Autel SDK
      // This is a simulated response
      const status: DroneStatus = {
        connected: this.connected,
        flightMode: 'gps',
        isFlying: false,
        battery: await this.getBatteryStatus(),
        gps: await this.getGPSStatus(),
        sensors: await this.getSensorStatus(),
        velocity: { x: 0, y: 0, z: 0 },
        altitude: 0,
        windSpeed: 2.5,
        errors: [],
        warnings: []
      };

      return status;
    } catch (error) {
      throw new Error(`Failed to get drone status: ${error}`);
    }
  }

  /**
   * Gets the current battery status
   * 
   * @returns Promise resolving to battery status
   * 
   * @example
   * ```typescript
   * const battery = await drone.getBatteryStatus();
   * if (battery.percentage < 20) {
   *   console.warn('Low battery!');
   * }
   * ```
   */
  public async getBatteryStatus(): Promise<BatteryStatus> {
    this.ensureConnected();

    // Simulated battery status
    // In actual implementation, retrieve from Autel SDK
    return {
      percentage: 85,
      voltage: 11.8,
      current: 2.5,
      temperature: 28,
      remainingFlightTime: 22,
      health: 'good',
      cycleCount: 45
    };
  }

  /**
   * Gets the current GPS status
   * 
   * @returns Promise resolving to GPS status
   * 
   * @example
   * ```typescript
   * const gps = await drone.getGPSStatus();
   * if (gps.satelliteCount < 6) {
   *   console.warn('Weak GPS signal');
   * }
   * ```
   */
  public async getGPSStatus(): Promise<GPSStatus> {
    this.ensureConnected();

    // Simulated GPS status
    // In actual implementation, retrieve from Autel SDK
    return {
      signalStrength: 4,
      satelliteCount: 12,
      fixStatus: '3d-fix',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 50,
      horizontalAccuracy: 1.5,
      verticalAccuracy: 2.0
    };
  }

  /**
   * Gets the current sensor status
   * 
   * @returns Promise resolving to sensor status
   * 
   * @example
   * ```typescript
   * const sensors = await drone.getSensorStatus();
   * if (!sensors.imu.calibrated) {
   *   console.warn('IMU needs calibration');
   * }
   * ```
   */
  public async getSensorStatus(): Promise<SensorStatus> {
    this.ensureConnected();

    // Simulated sensor status
    // In actual implementation, retrieve from Autel SDK
    return {
      imu: {
        calibrated: true,
        gyroscope: { x: 0.01, y: -0.02, z: 0.00 },
        accelerometer: { x: 0.0, y: 0.0, z: 9.81 }
      },
      compass: {
        calibrated: true,
        heading: 180,
        interference: 'none'
      },
      barometer: {
        operational: true,
        pressure: 1013.25,
        altitude: 50
      },
      visionSensors: {
        forward: true,
        backward: true,
        downward: true,
        upward: true
      },
      infraredSensors: {
        front: true,
        rear: true
      }
    };
  }

  /**
   * Starts monitoring drone status with periodic updates
   * 
   * @private
   * @param intervalMs - Update interval in milliseconds (default: 1000)
   */
  private startStatusMonitoring(intervalMs: number = 1000): void {
    // In actual implementation, subscribe to Autel SDK status updates
    setInterval(async () => {
      if (this.connected) {
        try {
          const status = await this.getStatus();
          this.notifyStatusUpdate(status);
        } catch (error) {
          console.error('Status monitoring error:', error);
        }
      }
    }, intervalMs);
  }

  // ==================== Pre-flight Checks ====================

  /**
   * Runs pre-flight validation covering battery, GPS, weather, airspace, sensors, controller, and storage.
   */
  public async validatePreFlight(params: {
    location?: { latitude: number; longitude: number };
    weatherApiUrl?: string;
    weatherApiKey?: string;
    airspaceApiUrl?: string;
    minBatteryPct?: number;
    minSatellites?: number;
  } = {}): Promise<PreFlightCheckResult> {
    this.ensureConnected();

    const minBattery = params.minBatteryPct ?? 60;
    const minSats = params.minSatellites ?? 8;

    const status = await this.getStatus();
    const reasons: string[] = [];
    const details: Record<string, { ok: boolean; value?: unknown; message?: string }> = {};

    // Battery
    const batteryOk = status.battery.percentage >= minBattery;
    if (!batteryOk) reasons.push(`Battery too low (${status.battery.percentage}% < ${minBattery}%)`);
    details.battery = { ok: batteryOk, value: status.battery.percentage };

    // GPS
    const gpsOk = status.gps.satelliteCount >= minSats && status.gps.fixStatus === '3d-fix';
    if (!gpsOk) reasons.push(`Insufficient GPS (${status.gps.satelliteCount} sats, fix=${status.gps.fixStatus})`);
    details.gps = { ok: gpsOk, value: { satellites: status.gps.satelliteCount, fix: status.gps.fixStatus } };

    // Sensors
    const sensorsOk =
      status.sensors.imu.calibrated &&
      status.sensors.compass.calibrated &&
      status.sensors.visionSensors.forward &&
      status.sensors.visionSensors.backward &&
      status.sensors.visionSensors.downward &&
      status.sensors.visionSensors.upward;
    if (!sensorsOk) reasons.push('Sensor health failed (IMU/compass/vision)');
    details.sensors = { ok: sensorsOk, value: status.sensors };

    // Controller connection (basic check on SDK connection state)
    const controllerOk = this.connected;
    if (!controllerOk) reasons.push('Controller not connected');
    details.controller = { ok: controllerOk };

    // Storage (simulated; replace with SDK query if available)
    const storageInfo = await this.getStorageStatus();
    const storageOk = storageInfo.freeMb >= storageInfo.minRequiredMb;
    if (!storageOk) reasons.push(`Insufficient storage (${storageInfo.freeMb}MB < ${storageInfo.minRequiredMb}MB)`);
    details.storage = { ok: storageOk, value: storageInfo };

    // Weather
    const weather = await this.getWeather(params.location ?? { latitude: status.gps.latitude, longitude: status.gps.longitude }, params.weatherApiUrl, params.weatherApiKey);
    const windOk = weather.windMph <= 15;
    if (!windOk) reasons.push(`Wind too strong (${weather.windMph} mph > 15 mph)`);
    const precipOk = !weather.isRainingOrSnowing;
    if (!precipOk) reasons.push(`Precipitation present (${weather.condition})`);
    details.weather = { ok: windOk && precipOk, value: weather };

    // Airspace
    const airspace = await this.checkAirspace(params.location ?? { latitude: status.gps.latitude, longitude: status.gps.longitude }, params.airspaceApiUrl);
    if (!airspace.allowed) reasons.push(`Airspace restricted: ${airspace.reason}`);
    details.airspace = { ok: airspace.allowed, message: airspace.reason };

    const ok = reasons.length === 0;
    this.logPreFlightAudit({ ok, reasons, details });
    return { ok, reasons, details };
  }

  private async getWeather(
    loc: { latitude: number; longitude: number },
    apiUrl?: string,
    apiKey?: string
  ): Promise<{ windMph: number; condition: string; isRainingOrSnowing: boolean }> {
    // Placeholder weather lookup; replace with real API call
    if (!apiUrl) {
      return {
        windMph: 8,
        condition: 'clear',
        isRainingOrSnowing: false
      };
    }

    try {
      const url = new URL(apiUrl);
      url.searchParams.set('lat', String(loc.latitude));
      url.searchParams.set('lon', String(loc.longitude));
      if (apiKey) url.searchParams.set('key', apiKey);
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`Weather API ${resp.status}`);
      const data = await resp.json();
      const windMph = data.windMph ?? data.wind?.speed ?? 0;
      const condition = data.condition ?? data.weather?.main ?? 'unknown';
      const isRainingOrSnowing = /rain|snow/i.test(condition);
      return { windMph, condition, isRainingOrSnowing };
    } catch (error) {
      console.warn('Weather lookup failed, falling back to onboard wind speed', error);
      return {
        windMph: 10,
        condition: 'unknown',
        isRainingOrSnowing: false
      };
    }
  }

  private async checkAirspace(
    loc: { latitude: number; longitude: number },
    apiUrl?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Placeholder for FAA/local airspace query
    if (!apiUrl) {
      return { allowed: true };
    }

    try {
      const url = new URL(apiUrl);
      url.searchParams.set('lat', String(loc.latitude));
      url.searchParams.set('lon', String(loc.longitude));
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`Airspace API ${resp.status}`);
      const data = await resp.json();
      const allowed = data.allowed ?? data.status !== 'restricted';
      const reason = data.reason ?? data.status;
      return { allowed, reason };
    } catch (error) {
      console.warn('Airspace lookup failed, defaulting to disallow', error);
      return { allowed: false, reason: 'Airspace lookup failed' };
    }
  }

  private async getStorageStatus(): Promise<{ freeMb: number; minRequiredMb: number }> {
    // Replace with SDK-provided storage query; simulated values here
    return {
      freeMb: 2048,
      minRequiredMb: 512
    };
  }

  private logPreFlightAudit(result: PreFlightCheckResult): void {
    console.log('Pre-flight audit', {
      timestamp: new Date().toISOString(),
      ok: result.ok,
      reasons: result.reasons,
      details: result.details
    });
  }

  // ==================== Flight Control ====================

  /**
   * Sends takeoff command to the drone
   * 
   * @param altitude - Target altitude in meters (default: 1.2m)
   * @returns Promise that resolves when takeoff is complete
   * @throws Error if takeoff fails or preconditions not met
   * 
   * @example
   * ```typescript
   * await drone.takeoff(5); // Take off to 5 meters
   * ```
   */
  public async takeoff(altitude: number = 1.2): Promise<void> {
    this.ensureConnected();

    // Validate preconditions
    const status = await this.getStatus();
    
    if (status.isFlying) {
      throw new Error('Drone is already flying');
    }

    if (status.battery.percentage < 15) {
      throw new Error('Battery too low for takeoff');
    }

    if (status.gps.satelliteCount < 6) {
      throw new Error('Insufficient GPS satellites');
    }

    try {
      await this.executeWithRetry(async () => {
        // In actual implementation, call Autel SDK takeoff method
        console.log(`Taking off to ${altitude}m...`);
        
        // Simulate takeoff
        await this.delay(3000);
      });

      console.log('Takeoff complete');
    } catch (error) {
      throw new Error(`Takeoff failed: ${error}`);
    }
  }

  /**
   * Sends landing command to the drone
   * 
   * @param autoLanding - If true, drone will land at current position (default: true)
   * @returns Promise that resolves when landing is complete
   * @throws Error if landing fails
   * 
   * @example
   * ```typescript
   * await drone.land();
   * ```
   */
  public async land(autoLanding: boolean = true): Promise<void> {
    this.ensureConnected();

    const status = await this.getStatus();
    
    if (!status.isFlying) {
      console.warn('Drone is not flying');
      return;
    }

    try {
      await this.executeWithRetry(async () => {
        // In actual implementation, call Autel SDK landing method
        console.log('Landing...');
        
        // Simulate landing
        await this.delay(5000);
      });

      console.log('Landing complete');
    } catch (error) {
      throw new Error(`Landing failed: ${error}`);
    }
  }

  /**
   * Sends return-to-home command to the drone
   * 
   * @returns Promise that resolves when drone reaches home point
   * @throws Error if RTH fails
   * 
   * @example
   * ```typescript
   * await drone.returnToHome();
   * ```
   */
  public async returnToHome(): Promise<void> {
    this.ensureConnected();

    try {
      await this.executeWithRetry(async () => {
        // In actual implementation, call Autel SDK RTH method
        console.log('Returning to home...');
        
        // Simulate RTH
        await this.delay(10000);
      });

      console.log('Return to home complete');
    } catch (error) {
      throw new Error(`Return to home failed: ${error}`);
    }
  }

  // ==================== Waypoint Missions ====================

  /**
   * Uploads and starts a waypoint mission
   * 
   * @param mission - Waypoint mission configuration
   * @returns Promise that resolves when mission starts
   * @throws Error if mission validation or upload fails
   * 
   * @example
   * ```typescript
   * const mission: WaypointMission = {
   *   name: 'Survey Mission',
   *   waypoints: [
   *     { index: 0, latitude: 37.7749, longitude: -122.4194, altitude: 50 },
   *     { index: 1, latitude: 37.7750, longitude: -122.4195, altitude: 50 },
   *     { index: 2, latitude: 37.7751, longitude: -122.4196, altitude: 50 }
   *   ],
   *   flightSpeed: 5,
   *   finishAction: 'return-to-home'
   * };
   * 
   * await drone.startWaypointMission(mission);
   * ```
   */
  public async startWaypointMission(mission: WaypointMission): Promise<void> {
    this.ensureConnected();

    // Validate mission
    this.validateWaypointMission(mission);

    const status = await this.getStatus();
    
    if (!status.isFlying) {
      throw new Error('Drone must be flying to start waypoint mission');
    }

    if (this.currentMission) {
      throw new Error('Another mission is already in progress');
    }

    try {
      await this.executeWithRetry(async () => {
        // In actual implementation, upload mission to Autel SDK
        console.log(`Uploading waypoint mission: ${mission.name}`);
        console.log(`Waypoints: ${mission.waypoints.length}`);
        
        // Simulate mission upload
        await this.delay(2000);
        
        // Start mission
        console.log('Starting waypoint mission...');
        this.currentMission = mission;
        this.missionPaused = false;
        this.currentWaypointIndex = 0;
        this.notifyMissionEvent({ type: 'mission-started', mission });
        this.startMissionProgressSimulation(mission);
      });

      console.log('Waypoint mission started');
    } catch (error) {
      throw new Error(`Failed to start waypoint mission: ${error}`);
    }
  }

  /**
   * Validates a waypoint mission
   * 
   * @private
   * @param mission - Mission to validate
   * @throws Error if mission is invalid
   */
  private validateWaypointMission(mission: WaypointMission): void {
    if (!mission.waypoints || mission.waypoints.length < 2) {
      throw new Error('Mission must have at least 2 waypoints');
    }

    if (mission.waypoints.length > 99) {
      throw new Error('Mission cannot have more than 99 waypoints');
    }

    if (mission.flightSpeed <= 0 || mission.flightSpeed > 15) {
      throw new Error('Flight speed must be between 0 and 15 m/s');
    }

    // Validate each waypoint
    mission.waypoints.forEach((waypoint, index) => {
      if (waypoint.index !== index) {
        throw new Error(`Waypoint index mismatch at position ${index}`);
      }

      if (waypoint.latitude < -90 || waypoint.latitude > 90) {
        throw new Error(`Invalid latitude at waypoint ${index}`);
      }

      if (waypoint.longitude < -180 || waypoint.longitude > 180) {
        throw new Error(`Invalid longitude at waypoint ${index}`);
      }

      if (waypoint.altitude < 0 || waypoint.altitude > 500) {
        throw new Error(`Invalid altitude at waypoint ${index} (must be 0-500m)`);
      }
    });
  }

  /**
   * Pauses the current waypoint mission
   * 
   * @returns Promise that resolves when mission is paused
   * @throws Error if no mission is active
   * 
   * @example
   * ```typescript
   * await drone.pauseMission();
   * ```
   */
  public async pauseMission(): Promise<void> {
    this.ensureConnected();

    if (!this.currentMission) {
      throw new Error('No active mission to pause');
    }

    if (this.missionPaused) {
      console.warn('Mission is already paused');
      return;
    }

    try {
      // In actual implementation, call Autel SDK pause mission method
      console.log('Pausing mission...');
      this.missionPaused = true;
    } catch (error) {
      throw new Error(`Failed to pause mission: ${error}`);
    }
  }

  /**
   * Resumes a paused waypoint mission
   * 
   * @returns Promise that resolves when mission is resumed
   * @throws Error if no mission is paused
   * 
   * @example
   * ```typescript
   * await drone.resumeMission();
   * ```
   */
  public async resumeMission(): Promise<void> {
    this.ensureConnected();

    if (!this.currentMission) {
      throw new Error('No active mission to resume');
    }

    if (!this.missionPaused) {
      console.warn('Mission is not paused');
      return;
    }

    try {
      // In actual implementation, call Autel SDK resume mission method
      console.log('Resuming mission...');
      this.missionPaused = false;
    } catch (error) {
      throw new Error(`Failed to resume mission: ${error}`);
    }
  }

  /**
   * Stops the current waypoint mission
   * 
   * @returns Promise that resolves when mission is stopped
   * @throws Error if stop fails
   * 
   * @example
   * ```typescript
   * await drone.stopMission();
   * ```
   */
  public async stopMission(): Promise<void> {
    this.ensureConnected();

    if (!this.currentMission) {
      console.warn('No active mission to stop');
      return;
    }

    try {
      // In actual implementation, call Autel SDK stop mission method
      console.log('Stopping mission...');
      this.clearMissionProgressTimer();
      this.notifyMissionEvent({
        type: 'mission-error',
        mission: this.currentMission,
        error: 'mission-stopped'
      });
      this.currentMission = null;
      this.missionPaused = false;
    } catch (error) {
      throw new Error(`Failed to stop mission: ${error}`);
    }
  }

  /**
   * Gets the current mission progress
   * 
   * @returns Current mission and progress information, or null if no active mission
   * 
   * @example
   * ```typescript
   * const progress = drone.getMissionProgress();
   * if (progress) {
   *   console.log(`Mission: ${progress.mission.name}`);
   *   console.log(`Current waypoint: ${progress.currentWaypointIndex}`);
   * }
   * ```
   */
  public getMissionProgress(): { 
    mission: WaypointMission; 
    currentWaypointIndex: number;
    paused: boolean;
  } | null {
    if (!this.currentMission) {
      return null;
    }

    // In actual implementation, get current waypoint from Autel SDK
    return {
      mission: this.currentMission,
      currentWaypointIndex: this.currentWaypointIndex,
      paused: this.missionPaused
    };
  }

  /**
   * Simulates mission progress and emits mission events until completion
   */
  private startMissionProgressSimulation(mission: WaypointMission): void {
    this.clearMissionProgressTimer();
    const totalWaypoints = mission.waypoints.length;
    this.missionProgressTimer = setInterval(() => {
      if (!this.currentMission) {
        this.clearMissionProgressTimer();
        return;
      }

      if (this.missionPaused) {
        return;
      }

      if (this.currentWaypointIndex < totalWaypoints - 1) {
        this.currentWaypointIndex += 1;
        this.notifyMissionEvent({
          type: 'waypoint-reached',
          mission,
          waypointIndex: this.currentWaypointIndex
        });
      } else {
        this.clearMissionProgressTimer();
        this.notifyMissionEvent({ type: 'mission-complete', mission });
        this.currentMission = null;
        this.missionPaused = false;
      }
    }, 3000);
  }

  /**
   * Clears mission progress timer state
   */
  private clearMissionProgressTimer(): void {
    if (this.missionProgressTimer) {
      clearInterval(this.missionProgressTimer);
      this.missionProgressTimer = null;
    }
  }

  // ==================== Mission Planning ====================

  /**
   * Plans a mission using templates and safety checks
   */
  public async planMission(input: MissionPlanningInput): Promise<MissionPlanResult> {
    this.ensureConnected();

    const status = await this.getStatus();
    const currentLocation = input.currentLocation ?? {
      latitude: status.gps.latitude,
      longitude: status.gps.longitude,
      altitude: status.altitude || status.gps.altitude
    };
    const homeLocation = input.homeLocation ?? {
      latitude: status.gps.latitude,
      longitude: status.gps.longitude,
      altitude: status.altitude || status.gps.altitude
    };

    this.validateMissionInput(input, currentLocation);

    const baseAltitude = input.cruiseAltitude;
    const cruiseSpeed = input.cruiseSpeed;
    const warnings: string[] = [];

    const waypoints: Waypoint[] = [];

    // Leg: current -> target
    waypoints.push({
      index: waypoints.length,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      altitude: baseAltitude,
      speed: cruiseSpeed,
      heading: this.calculateBearing(currentLocation, input.threatLocation)
    });

    // Template-specific legs
    const templateLegs = this.buildTemplateWaypoints({
      input,
      baseAltitude,
      cruiseSpeed,
      startIndex: waypoints.length
    });
    waypoints.push(...templateLegs);

    // Leg: target -> home
    waypoints.push({
      index: waypoints.length,
      latitude: homeLocation.latitude,
      longitude: homeLocation.longitude,
      altitude: baseAltitude,
      speed: cruiseSpeed,
      heading: this.calculateBearing(input.threatLocation, homeLocation)
    });

    const mission: WaypointMission = {
      name: `${input.template}-mission-${Date.now()}`,
      waypoints,
      flightSpeed: cruiseSpeed,
      finishAction: 'return-to-home',
      headingMode: 'auto'
    };

    this.validateWaypointMission(mission);

    const constraintWarnings = this.checkMissionConstraints(
      mission,
      input.noFlyZones ?? [],
      input.obstacles ?? [],
      input.maxDistanceMeters
    );
    warnings.push(...constraintWarnings);

    const totalDistanceMeters = this.calculateMissionDistance(mission.waypoints);
    const estimatedFlightMinutes = totalDistanceMeters / (cruiseSpeed || 1) / 60;
    const requiredBatteryMah = this.estimateBattery(totalDistanceMeters, cruiseSpeed);

    if (status.battery.percentage < 30) {
      warnings.push('Battery below 30% - mission may not complete safely');
    }

    return {
      mission,
      totalDistanceMeters,
      estimatedFlightMinutes,
      requiredBatteryMah,
      warnings
    };
  }

  /**
   * Exports a mission as an Autel-style waypoint payload (JSON string)
   */
  public exportMissionToAutelFormat(mission: WaypointMission): string {
    this.validateWaypointMission(mission);
    const payload = {
      version: '1.0',
      name: mission.name,
      finishAction: mission.finishAction,
      flightSpeed: mission.flightSpeed,
      headingMode: mission.headingMode ?? 'auto',
      waypoints: mission.waypoints.map(wp => ({
        index: wp.index,
        lat: wp.latitude,
        lng: wp.longitude,
        alt: wp.altitude,
        speed: wp.speed ?? mission.flightSpeed,
        heading: wp.heading ?? 0,
        action: wp.action ?? 'none',
        hoverTime: wp.hoverTime ?? 0
      }))
    };

    return JSON.stringify(payload, null, 2);
  }

  private validateMissionInput(
    input: MissionPlanningInput,
    current: { latitude: number; longitude: number; altitude?: number }
  ): void {
    if (input.cruiseAltitude < 10 || input.cruiseAltitude > 120) {
      throw new Error('Cruise altitude must be between 10m and 120m AGL');
    }
    if (input.cruiseSpeed <= 0 || input.cruiseSpeed > 15) {
      throw new Error('Cruise speed must be between 0 and 15 m/s');
    }
    if (!this.isValidCoordinate(input.threatLocation.latitude, input.threatLocation.longitude)) {
      throw new Error('Threat location is invalid');
    }
    if (!this.isValidCoordinate(current.latitude, current.longitude)) {
      throw new Error('Current location is invalid');
    }
  }

  private buildTemplateWaypoints(params: {
    input: MissionPlanningInput;
    baseAltitude: number;
    cruiseSpeed: number;
    startIndex: number;
  }): Waypoint[] {
    const { input, baseAltitude, cruiseSpeed } = params;
    const points: Waypoint[] = [];

    // Ingress to target
    points.push({
      index: params.startIndex + points.length,
      latitude: input.threatLocation.latitude,
      longitude: input.threatLocation.longitude,
      altitude: baseAltitude,
      speed: cruiseSpeed,
      action: 'hover',
      hoverTime: 3
    });

    // Orbit pattern
    const orbit = this.generateOrbit(
      input.threatLocation,
      input.orbitRadiusMeters ?? 25,
      input.orbitPoints ?? 8,
      baseAltitude,
      cruiseSpeed,
      params.startIndex + points.length
    );
    points.push(...orbit);

    if (input.template === 'perimeter') {
      const perimeter = this.generatePerimeterRing(
        input.threatLocation,
        input.orbitRadiusMeters ?? 25,
        baseAltitude,
        cruiseSpeed,
        params.startIndex + points.length
      );
      points.push(...perimeter);
    }

    if (input.template === 'patrol') {
      points.push({
        index: params.startIndex + points.length,
        latitude: input.threatLocation.latitude,
        longitude: input.threatLocation.longitude,
        altitude: baseAltitude,
        speed: cruiseSpeed,
        action: 'hover',
        hoverTime: 5
      });
    }

    if (input.template === 'investigate') {
      points.push({
        index: params.startIndex + points.length,
        latitude: input.threatLocation.latitude,
        longitude: input.threatLocation.longitude,
        altitude: baseAltitude - 5,
        speed: cruiseSpeed * 0.6,
        action: 'hover',
        hoverTime: 8
      });
    }

    return points;
  }

  private generateOrbit(
    center: { latitude: number; longitude: number },
    radiusMeters: number,
    count: number,
    altitude: number,
    speed: number,
    startIndex: number
  ): Waypoint[] {
    const waypoints: Waypoint[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (360 / count) * i;
      const dest = this.destinationPoint(center, radiusMeters, angle);
      waypoints.push({
        index: startIndex + i,
        latitude: dest.latitude,
        longitude: dest.longitude,
        altitude,
        speed,
        heading: (angle + 90) % 360
      });
    }
    return waypoints;
  }

  private generatePerimeterRing(
    center: { latitude: number; longitude: number },
    radiusMeters: number,
    altitude: number,
    speed: number,
    startIndex: number
  ): Waypoint[] {
    const offsets = [45, 135, 225, 315];
    return offsets.map((bearing, idx) => {
      const dest = this.destinationPoint(center, radiusMeters * 1.5, bearing);
      return {
        index: startIndex + idx,
        latitude: dest.latitude,
        longitude: dest.longitude,
        altitude,
        speed,
        heading: (bearing + 90) % 360
      };
    });
  }

  private checkMissionConstraints(
    mission: WaypointMission,
    noFlyZones: NoFlyZone[],
    obstacles: Obstacle[],
    maxDistanceMeters?: number
  ): string[] {
    const warnings: string[] = [];

    mission.waypoints.forEach(wp => {
      if (this.isInsideNoFlyZone(wp, noFlyZones)) {
        warnings.push(`Waypoint ${wp.index} intersects a no-fly zone`);
      }
      if (this.isNearObstacle(wp, obstacles)) {
        warnings.push(`Waypoint ${wp.index} is near an obstacle`);
      }
    });

    const totalDistance = this.calculateMissionDistance(mission.waypoints);
    if (maxDistanceMeters && totalDistance > maxDistanceMeters) {
      warnings.push(`Mission distance ${totalDistance.toFixed(0)}m exceeds limit of ${maxDistanceMeters}m`);
    }

    return warnings;
  }

  private isNearObstacle(point: { latitude: number; longitude: number }, obstacles: Obstacle[]): boolean {
    return obstacles.some(ob => {
      const dist = this.haversineDistance(point, ob);
      return dist <= ob.radiusMeters + 10;
    });
  }

  private isInsideNoFlyZone(point: { latitude: number; longitude: number; altitude?: number }, zones: NoFlyZone[]): boolean {
    return zones.some(zone => {
      if (zone.vertices.length < 3) return false;
      const withinAlt =
        (zone.minAltitude === undefined || (point.altitude ?? 0) >= zone.minAltitude) &&
        (zone.maxAltitude === undefined || (point.altitude ?? 0) <= zone.maxAltitude);
      return withinAlt && this.pointInPolygon(point, zone.vertices);
    });
  }

  private pointInPolygon(point: { latitude: number; longitude: number }, vertices: Array<{ latitude: number; longitude: number }>): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      // eslint-disable-next-line security/detect-object-injection
      const xi = vertices[i].longitude, yi = vertices[i].latitude;
      // eslint-disable-next-line security/detect-object-injection
      const xj = vertices[j].longitude, yj = vertices[j].latitude;
      const intersect = ((yi > point.latitude) !== (yj > point.latitude)) &&
        (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private calculateMissionDistance(waypoints: Waypoint[]): number {
    let distance = 0;
    for (let i = 1; i < waypoints.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      distance += this.haversineDistance(waypoints[i - 1], waypoints[i]);
    }
    return distance;
  }

  private estimateBattery(distanceMeters: number, cruiseSpeed: number): number {
    const minutes = distanceMeters / (cruiseSpeed || 1) / 60;
    const mAhPerMinute = 750; // rough heuristic
    return Math.ceil(minutes * mAhPerMinute);
  }

  private haversineDistance(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  private calculateBearing(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
    return brng;
  }

  private destinationPoint(
    start: { latitude: number; longitude: number },
    distanceMeters: number,
    bearingDegrees: number
  ): { latitude: number; longitude: number } {
    const R = 6371000;
    const δ = distanceMeters / R;
    const θ = (bearingDegrees * Math.PI) / 180;
    const φ1 = (start.latitude * Math.PI) / 180;
    const λ1 = (start.longitude * Math.PI) / 180;

    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
    );
    const λ2 =
      λ1 + Math.atan2(
        Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
      );

    return {
      latitude: (φ2 * 180) / Math.PI,
      longitude: ((λ2 * 180) / Math.PI + 540) % 360 - 180
    };
  }

  private isValidCoordinate(latitude: number, longitude: number): boolean {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  // ==================== Camera Management ====================

  /**
   * Starts streaming camera feed(s)
   * 
   * @param config - Camera stream configuration
   * @param callback - Callback function to receive camera frames
   * @returns Promise that resolves when stream starts
   * @throws Error if stream fails to start
   * 
   * @example
   * ```typescript
   * await drone.startCameraStream(
   *   { cameraType: 'both', resolution: '1080p', frameRate: 30 },
   *   (frame) => {
   *     console.log(`Received ${frame.cameraType} frame`);
   *     // Process frame data
   *   }
   * );
   * ```
   */
  public async startCameraStream(
    config: CameraStreamConfig,
    callback: CameraFrameCallback
  ): Promise<void> {
    this.ensureConnected();

    this.cameraCallbacks.add(callback);

    try {
      // In actual implementation, start Autel SDK camera stream
      console.log(`Starting camera stream: ${config.cameraType} at ${config.resolution}`);
      
      // Simulate camera stream
      this.simulateCameraStream(config);
    } catch (error) {
      this.cameraCallbacks.delete(callback);
      throw new Error(`Failed to start camera stream: ${error}`);
    }
  }

  /**
   * Stops all active camera streams
   * 
   * @returns Promise that resolves when streams are stopped
   * 
   * @example
   * ```typescript
   * await drone.stopCameraStream();
   * ```
   */
  public async stopCameraStream(): Promise<void> {
    // In actual implementation, stop Autel SDK camera stream
    console.log('Stopping camera streams...');
    this.cameraCallbacks.clear();
  }

  /**
   * Configures thermal camera settings
   * 
   * @param settings - Thermal camera settings
   * @returns Promise that resolves when settings are applied
   * @throws Error if configuration fails
   * 
   * @example
   * ```typescript
   * await drone.setThermalCameraSettings({
   *   palette: 'iron-red',
   *   temperatureUnit: 'celsius',
   *   emissivity: 0.95,
   *   enableIsotherms: true,
   *   isothermRange: { min: 30, max: 40 }
   * });
   * ```
   */
  public async setThermalCameraSettings(settings: ThermalCameraSettings): Promise<void> {
    this.ensureConnected();

    if (settings.emissivity < 0.1 || settings.emissivity > 1.0) {
      throw new Error('Emissivity must be between 0.1 and 1.0');
    }

    try {
      // In actual implementation, configure Autel SDK thermal camera
      console.log('Configuring thermal camera settings...');
      console.log(`Palette: ${settings.palette}`);
      console.log(`Emissivity: ${settings.emissivity}`);
    } catch (error) {
      throw new Error(`Failed to set thermal camera settings: ${error}`);
    }
  }

  /**
   * Captures a photo with the specified camera
   * 
   * @param cameraType - Camera to use for capture
   * @returns Promise resolving to captured image data
   * @throws Error if capture fails
   * 
   * @example
   * ```typescript
   * const photo = await drone.capturePhoto('thermal');
   * // Save or process photo data
   * ```
   */
  public async capturePhoto(cameraType: 'visual' | 'thermal' = 'visual'): Promise<CameraFrame> {
    this.ensureConnected();

    try {
      await this.executeWithRetry(async () => {
        // In actual implementation, capture photo with Autel SDK
        console.log(`Capturing photo with ${cameraType} camera...`);
      });

      // Return simulated photo data
      return {
        timestamp: Date.now(),
        data: 'base64_encoded_image_data',
        width: 1920,
        height: 1080,
        cameraType,
        thermalData: cameraType === 'thermal' ? {
          minTemperature: 15.5,
          maxTemperature: 45.2,
          avgTemperature: 28.3
        } : undefined
      };
    } catch (error) {
      throw new Error(`Failed to capture photo: ${error}`);
    }
  }

  /**
   * Starts video recording
   * 
   * @param cameraType - Camera to use for recording
   * @returns Promise that resolves when recording starts
   * @throws Error if recording fails to start
   * 
   * @example
   * ```typescript
   * await drone.startRecording('both');
   * ```
   */
  public async startRecording(cameraType: 'visual' | 'thermal' | 'both' = 'visual'): Promise<void> {
    this.ensureConnected();

    try {
      // In actual implementation, start recording with Autel SDK
      console.log(`Starting ${cameraType} camera recording...`);
    } catch (error) {
      throw new Error(`Failed to start recording: ${error}`);
    }
  }

  /**
   * Stops video recording
   * 
   * @returns Promise that resolves when recording stops
   * @throws Error if stop fails
   * 
   * @example
   * ```typescript
   * await drone.stopRecording();
   * ```
   */
  public async stopRecording(): Promise<void> {
    this.ensureConnected();

    try {
      // In actual implementation, stop recording with Autel SDK
      console.log('Stopping recording...');
    } catch (error) {
      throw new Error(`Failed to stop recording: ${error}`);
    }
  }

  /**
   * Simulates camera stream for testing
   * 
   * @private
   * @param config - Stream configuration
   */
  private simulateCameraStream(config: CameraStreamConfig): void {
    const streamInterval = setInterval(() => {
      if (this.cameraCallbacks.size === 0) {
        clearInterval(streamInterval);
        return;
      }

      const cameras: Array<'visual' | 'thermal'> = 
        config.cameraType === 'both' ? ['visual', 'thermal'] : [config.cameraType];

      cameras.forEach(cameraType => {
        const frame: CameraFrame = {
          timestamp: Date.now(),
          data: 'simulated_frame_data',
          width: config.resolution === '4k' ? 3840 : config.resolution === '1080p' ? 1920 : 1280,
          height: config.resolution === '4k' ? 2160 : config.resolution === '1080p' ? 1080 : 720,
          cameraType,
          thermalData: cameraType === 'thermal' ? {
            minTemperature: 18 + Math.random() * 5,
            maxTemperature: 40 + Math.random() * 10,
            avgTemperature: 25 + Math.random() * 8
          } : undefined
        };

        this.notifyCameraFrame(frame);
      });
    }, 1000 / config.frameRate);
  }

  // ==================== Event Management ====================

  /**
   * Registers a callback for drone status updates
   * 
   * @param callback - Callback function to receive status updates
   * 
   * @example
   * ```typescript
   * drone.onStatusUpdate((status) => {
   *   console.log(`Battery: ${status.battery.percentage}%`);
   *   console.log(`Altitude: ${status.altitude}m`);
   * });
   * ```
   */
  public onStatusUpdate(callback: DroneEventCallback): void {
    this.statusCallbacks.add(callback);
  }

  /**
   * Registers a callback for connection state changes
   * 
   * @param callback - Callback function to receive connection updates
   * 
   * @example
   * ```typescript
   * drone.onConnectionChange((connected) => {
   *   console.log(connected ? 'Connected' : 'Disconnected');
   * });
   * ```
   */
  public onConnectionChange(callback: ConnectionEventCallback): void {
    this.connectionCallbacks.add(callback);
  }

  /**
   * Registers a callback for error events
   * 
   * @param callback - Callback function to receive errors
   * 
   * @example
   * ```typescript
   * drone.onError((error) => {
   *   console.error('Drone error:', error.message);
   * });
   * ```
   */
  public onError(callback: ErrorEventCallback): void {
    this.errorCallbacks.add(callback);
  }

  /**
   * Registers a callback for mission events (start, waypoint, completion, error)
   */
  public onMissionEvent(callback: MissionEventCallback): () => void {
    this.missionEventCallbacks.add(callback);
    return () => this.missionEventCallbacks.delete(callback);
  }

  /**
   * Removes a status update callback
   * 
   * @param callback - Callback to remove
   */
  public offStatusUpdate(callback: DroneEventCallback): void {
    this.statusCallbacks.delete(callback);
  }

  /**
   * Removes a connection change callback
   * 
   * @param callback - Callback to remove
   */
  public offConnectionChange(callback: ConnectionEventCallback): void {
    this.connectionCallbacks.delete(callback);
  }

  /**
   * Removes a mission event callback
   */
  public offMissionEvent(callback: MissionEventCallback): void {
    this.missionEventCallbacks.delete(callback);
  }

  /**
   * Removes an error callback
   * 
   * @param callback - Callback to remove
   */
  public offError(callback: ErrorEventCallback): void {
    this.errorCallbacks.delete(callback);
  }

  /**
   * Notifies all status callbacks
   * 
   * @private
   * @param status - Drone status to broadcast
   */
  private notifyStatusUpdate(status: DroneStatus): void {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in status callback:', error);
      }
    });
  }

  /**
   * Notifies all camera frame callbacks
   * 
   * @private
   * @param frame - Camera frame to broadcast
   */
  private notifyCameraFrame(frame: CameraFrame): void {
    this.cameraCallbacks.forEach(callback => {
      try {
        callback(frame);
      } catch (error) {
        console.error('Error in camera frame callback:', error);
      }
    });
  }

  /**
   * Notifies all connection callbacks
   * 
   * @private
   * @param connected - Connection state
   */
  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('Error in connection callback:', error);
      }
    });
  }

  /**
   * Notifies mission event subscribers
   */
  private notifyMissionEvent(event: MissionEvent): void {
    this.missionEventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in mission event callback:', error);
      }
    });
  }

  // ==================== Utility Methods ====================

  /**
   * Executes an async function with retry logic
   * 
   * @private
   * @param fn - Async function to execute
   * @param config - Retry configuration
   * @returns Promise that resolves with function result
   * @throws Error if all retry attempts fail
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = this.defaultRetryConfig
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = config.initialDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < config.maxRetries) {
          console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await this.delay(delay);
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        }
      }
    }

    throw new Error(`Operation failed after ${config.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Utility delay function
   * 
   * @private
   * @param ms - Delay in milliseconds
   * @returns Promise that resolves after delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensures drone is connected, throws error if not
   * 
   * @private
   * @throws Error if not connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to drone. Call connect() first.');
    }
  }

  /**
   * Handles errors and notifies error callbacks
   * 
   * @private
   * @param error - Error to handle
   */
  private handleError(error: Error): void {
    console.error('Drone SDK Error:', error.message);
    
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });

    // Check if we should attempt reconnection
    if (this.connected && error.message.includes('connection')) {
      this.connected = false;
      this.notifyConnectionChange(false);
      this.attemptReconnect();
    }
  }

  /**
   * Cleanup and dispose resources
   * 
   * @example
   * ```typescript
   * await drone.dispose();
   * ```
   */
  public async dispose(): Promise<void> {
    await this.disconnect();
    this.statusCallbacks.clear();
    this.cameraCallbacks.clear();
    this.connectionCallbacks.clear();
    this.errorCallbacks.clear();
  }
}

export default AutelDroneSDK;
