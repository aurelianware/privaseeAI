// Autel EVO Lite Drone SDK Type Definitions

/**
 * Drone connection states
 */
export enum DroneConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Flight modes supported by Autel EVO Lite
 */
export enum FlightMode {
  MANUAL = 'manual',
  GPS = 'gps',
  SPORT = 'sport',
  WAYPOINT = 'waypoint',
  FOLLOW_ME = 'follow_me',
  ORBIT = 'orbit',
  RTH = 'return_to_home',
}

/**
 * Drone telemetry data
 */
export interface DroneTelemetry {
  timestamp: Date;
  position: {
    latitude: number;
    longitude: number;
    altitude: number; // meters above sea level
    relativeAltitude: number; // meters above takeoff point
  };
  velocity: {
    x: number; // m/s
    y: number; // m/s
    z: number; // m/s
  };
  attitude: {
    roll: number; // degrees
    pitch: number; // degrees
    yaw: number; // degrees
  };
  battery: {
    percentage: number; // 0-100
    voltage: number; // volts
    current: number; // amps
    temperature: number; // celsius
    remainingFlightTime: number; // seconds
  };
  gps: {
    satelliteCount: number;
    signalStrength: number; // 0-100
    accuracy: number; // meters
  };
  sensors: {
    isIMUHealthy: boolean;
    isCompassHealthy: boolean;
    isGPSHealthy: boolean;
  };
  flightMode: FlightMode;
  isFlying: boolean;
  isLanding: boolean;
  isTakingOff: boolean;
  obstacleDetection?: {
    front: number; // distance in meters
    back: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

/**
 * Drone command types
 */
export enum DroneCommandType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  TAKEOFF = 'takeoff',
  LAND = 'land',
  RTH = 'return_to_home',
  EMERGENCY_STOP = 'emergency_stop',
  START_MISSION = 'start_mission',
  PAUSE_MISSION = 'pause_mission',
  RESUME_MISSION = 'resume_mission',
  CANCEL_MISSION = 'cancel_mission',
  SET_FLIGHT_MODE = 'set_flight_mode',
  MOVE_TO_POSITION = 'move_to_position',
  ROTATE = 'rotate',
  SET_GIMBAL = 'set_gimbal',
  START_RECORDING = 'start_recording',
  STOP_RECORDING = 'stop_recording',
  TAKE_PHOTO = 'take_photo',
}

/**
 * Drone command interface
 */
export interface DroneCommand {
  type: DroneCommandType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: Record<string, any>;
  timeout?: number; // milliseconds
  priority?: 'low' | 'medium' | 'high' | 'emergency';
}

/**
 * Command response
 */
export interface DroneCommandResponse {
  success: boolean;
  commandType: DroneCommandType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  error?: DroneError;
  executionTime: number; // milliseconds
  timestamp: Date;
}

/**
 * Drone error types
 */
export enum DroneErrorCode {
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_LOST = 'connection_lost',
  COMMAND_TIMEOUT = 'command_timeout',
  COMMAND_FAILED = 'command_failed',
  LOW_BATTERY = 'low_battery',
  CRITICAL_BATTERY = 'critical_battery',
  GPS_SIGNAL_LOST = 'gps_signal_lost',
  OBSTACLE_DETECTED = 'obstacle_detected',
  GEOFENCE_VIOLATION = 'geofence_violation',
  MOTOR_ERROR = 'motor_error',
  SENSOR_ERROR = 'sensor_error',
  WEATHER_UNSAFE = 'weather_unsafe',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Drone error interface
 */
export interface DroneError {
  code: DroneErrorCode;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  recoverable: boolean;
}

/**
 * Mission waypoint
 */
export interface MissionWaypoint {
  id: string;
  latitude: number;
  longitude: number;
  altitude: number; // meters above sea level
  speed?: number; // m/s, optional (uses default if not specified)
  heading?: number; // degrees, optional
  gimbalPitch?: number; // degrees, optional
  actions?: WaypointAction[];
  dwellTime?: number; // seconds to hover at waypoint
}

/**
 * Waypoint action types
 */
export enum WaypointActionType {
  TAKE_PHOTO = 'take_photo',
  START_RECORDING = 'start_recording',
  STOP_RECORDING = 'stop_recording',
  ROTATE = 'rotate',
  HOVER = 'hover',
}

/**
 * Actions to perform at waypoints
 */
export interface WaypointAction {
  type: WaypointActionType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: Record<string, any>;
}

/**
 * Drone mission definition
 */
export interface DroneMission {
  id: string;
  name: string;
  description?: string;
  waypoints: MissionWaypoint[];
  settings: {
    autoTakeoff: boolean;
    autoLand: boolean;
    autoRTH: boolean; // Return to home after mission
    maxSpeed: number; // m/s
    maxAltitude: number; // meters
    finishAction: 'hover' | 'land' | 'return_to_home';
  };
  geofence?: {
    center: { latitude: number; longitude: number };
    radius: number; // meters
    maxAltitude: number; // meters
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mission execution state
 */
export enum MissionState {
  IDLE = 'idle',
  VALIDATING = 'validating',
  READY = 'ready',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

/**
 * Mission execution status
 */
export interface MissionStatus {
  state: MissionState;
  currentWaypointIndex: number;
  totalWaypoints: number;
  progress: number; // 0-100
  startTime?: Date;
  estimatedTimeRemaining?: number; // seconds
  errors: DroneError[];
}

/**
 * Drone configuration
 */
export interface DroneConfig {
  connectionSettings: {
    host: string;
    port: number;
    protocol: 'tcp' | 'udp' | 'websocket';
    apiKey?: string;
    timeout: number; // milliseconds
    retryAttempts: number;
    retryDelay: number; // milliseconds
  };
  flightSettings: {
    maxSpeed: number; // m/s
    maxAltitude: number; // meters
    maxDistance: number; // meters from home point
    returnHomeAltitude: number; // meters
    lowBatteryWarning: number; // percentage
    criticalBatteryLevel: number; // percentage
    enableObstacleAvoidance: boolean;
  };
  cameraSettings: {
    defaultPhotoFormat: 'jpeg' | 'raw' | 'jpeg+raw';
    defaultVideoFormat: 'mp4' | 'mov';
    defaultVideoResolution: '4k' | '1080p' | '720p';
    autoRecordOnTakeoff: boolean;
  };
  privacySettings: {
    enableLocalStorage: boolean;
    encryptFlightLogs: boolean;
    autoDeleteAfterDays: number;
    requireAuthForAccess: boolean;
  };
}

/**
 * Drone event types
 */
export enum DroneEventType {
  CONNECTION_CHANGED = 'connection_changed',
  TELEMETRY_UPDATE = 'telemetry_update',
  FLIGHT_MODE_CHANGED = 'flight_mode_changed',
  MISSION_STARTED = 'mission_started',
  MISSION_PAUSED = 'mission_paused',
  MISSION_RESUMED = 'mission_resumed',
  MISSION_COMPLETED = 'mission_completed',
  MISSION_FAILED = 'mission_failed',
  WAYPOINT_REACHED = 'waypoint_reached',
  LOW_BATTERY = 'low_battery',
  CRITICAL_BATTERY = 'critical_battery',
  GPS_SIGNAL_CHANGED = 'gps_signal_changed',
  ERROR = 'error',
  OBSTACLE_DETECTED = 'obstacle_detected',
  GEOFENCE_BREACH = 'geofence_breach',
  CAMERA_PHOTO_TAKEN = 'camera_photo_taken',
  CAMERA_RECORDING_STARTED = 'camera_recording_started',
  CAMERA_RECORDING_STOPPED = 'camera_recording_stopped',
}

/**
 * Drone event payload
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DroneEvent<T = any> {
  type: DroneEventType;
  timestamp: Date;
  droneId: string;
  data: T;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Flight log entry
 */
export interface FlightLogEntry {
  id: string;
  droneId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  takeoffLocation: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  landingLocation?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  maxAltitude: number;
  maxSpeed: number;
  totalDistance: number; // meters
  averageBatteryUsage: number; // percentage
  events: DroneEvent[];
  missionId?: string;
  errors: DroneError[];
  telemetryData?: DroneTelemetry[]; // Sampled telemetry
}
