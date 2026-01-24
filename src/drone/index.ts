// Drone Module - Main exports
// Central export point for all drone-related functionality

// Types
export * from './types';

// Configuration
export { DroneConfigManager, getDroneConfig, updateDroneConfig } from './config/DroneConfig';

// Control
export { DroneController, createDroneController } from './control/DroneController';
export type { ConnectionOptions } from './control/DroneController';

// Missions
export { MissionPlanner, getMissionPlanner, createSimpleMission } from './missions/MissionPlanner';
export type { MissionValidationResult } from './missions/MissionPlanner';

// Events
export { DroneEventEmitter, getEventEmitter, createEventListener } from './events/EventEmitter';
export type { EventListener, EventSubscription } from './events/EventEmitter';

// Logger
export { FlightLogger, getLogger, logger } from './logger/FlightLogger';
export type { LogEntry, LoggerConfig } from './logger/FlightLogger';
export { LogLevel } from './logger/FlightLogger';

// Recovery
export { DroneErrorHandler, getErrorHandler, createDroneError } from './recovery/ErrorHandler';
export type { RecoveryAction, ErrorHandlerConfig } from './recovery/ErrorHandler';
export { RecoveryStrategy } from './recovery/ErrorHandler';

// Adapters
export { DroneAdapter, createDroneAdapter } from './adapters/DroneAdapter';
export type { DroneConnectionInfo } from './adapters/DroneAdapter';
