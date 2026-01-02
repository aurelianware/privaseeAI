# Autel EVO Lite Drone SDK Integration

## Overview

This module integrates the Autel EVO Lite drone SDK with the privaseeAI privacy-focused surveillance system. It provides a comprehensive TypeScript-based interface for drone control, mission planning, event handling, and error recovery.

## Architecture

The drone integration follows a modular architecture with clear separation of concerns:

```
src/drone/
├── types/              # TypeScript type definitions
├── config/             # Configuration management
├── control/            # Drone control and flight operations
├── missions/           # Mission planning and validation
├── events/             # Event handling and telemetry
├── logger/             # Flight operations logging
├── recovery/           # Error handling and recovery
└── adapters/           # Integration with privaseeAI device system
```

## Modules

### 1. Types (`src/drone/types/`)

Comprehensive TypeScript definitions for all drone-related data structures:

- **DroneConnectionState**: Connection states (disconnected, connecting, connected, error)
- **FlightMode**: Supported flight modes (manual, GPS, sport, waypoint, follow_me, orbit, RTH)
- **DroneTelemetry**: Complete telemetry data including position, velocity, attitude, battery, GPS, sensors
- **DroneCommand**: Command types and structures
- **DroneMission**: Mission definitions with waypoints and settings
- **DroneEvent**: Event types and payloads
- **FlightLogEntry**: Flight log data structures

### 2. Configuration (`src/drone/config/`)

**DroneConfigManager** - Singleton configuration manager with validation:

```typescript
import { getDroneConfig, updateDroneConfig } from './drone';

// Get configuration
const config = getDroneConfig();

// Update configuration
updateDroneConfig({
  flightSettings: {
    maxAltitude: 100,
    maxSpeed: 12,
  }
});
```

Configuration sections:
- **connectionSettings**: Host, port, protocol, API key, timeouts
- **flightSettings**: Speed, altitude, distance limits, battery warnings
- **cameraSettings**: Photo/video formats and resolutions
- **privacySettings**: Storage, encryption, retention policies

### 3. Control (`src/drone/control/`)

**DroneController** - Main controller for flight operations:

```typescript
import { createDroneController } from './drone';

const controller = createDroneController('drone-001');

// Connect to drone
await controller.connect({
  host: '192.168.1.100',
  port: 8889,
  apiKey: 'your-api-key'
});

// Flight operations
await controller.takeoff(10); // 10 meters
await controller.moveToPosition(37.7749, -122.4194, 50);
await controller.land();

// Camera operations
await controller.startRecording();
await controller.takePhoto();
await controller.stopRecording();

// Get telemetry
const telemetry = controller.getTelemetry();
console.log('Battery:', telemetry.battery.percentage);
```

### 4. Mission Planning (`src/drone/missions/`)

**MissionPlanner** - Create, validate, and manage autonomous missions:

```typescript
import { getMissionPlanner, createSimpleMission } from './drone';

const planner = getMissionPlanner();

// Create mission with waypoints
const mission = planner.createMission('Perimeter Survey', [
  { id: 'wp1', latitude: 37.7749, longitude: -122.4194, altitude: 30 },
  { id: 'wp2', latitude: 37.7750, longitude: -122.4195, altitude: 30 },
  { id: 'wp3', latitude: 37.7751, longitude: -122.4196, altitude: 30 },
], 'Survey the perimeter');

// Validate mission
const validation = planner.validateMission(mission.id);
if (!validation.isValid) {
  console.error('Mission validation failed:', validation.errors);
}

// Set geofence
planner.setGeofence(mission.id, 
  { latitude: 37.7750, longitude: -122.4195 },
  500 // 500 meter radius
);

// Calculate mission stats
const distance = planner.calculateMissionDistance(mission);
const duration = planner.estimateMissionDuration(mission);
console.log(`Mission: ${distance}m, ~${duration}s`);
```

### 5. Event Handling (`src/drone/events/`)

**DroneEventEmitter** - Event-driven architecture for real-time updates:

```typescript
import { getEventEmitter } from './drone';

const eventEmitter = getEventEmitter();

// Subscribe to events
const subId = eventEmitter.onTelemetryUpdate((event) => {
  console.log('Telemetry:', event.data);
}, 'drone-001');

eventEmitter.onLowBattery((event) => {
  console.warn('Low battery:', event.data.percentage);
});

eventEmitter.onObstacleDetected((event) => {
  console.warn('Obstacle:', event.data.direction, event.data.distance);
});

// Unsubscribe
eventEmitter.off(subId);

// Get event history
const history = eventEmitter.getEventHistory('drone-001', undefined, 50);
```

### 6. Logging (`src/drone/logger/`)

**FlightLogger** - Comprehensive logging system for flight operations:

```typescript
import { getLogger, LogLevel } from './drone';

const logger = getLogger({
  logLevel: LogLevel.INFO,
  enableConsoleLogging: true,
  enableFileLogging: true,
});

// Log messages
logger.info('FLIGHT', 'Takeoff initiated');
logger.warn('BATTERY', 'Battery level low', { percentage: 25 });
logger.error('MOTOR', 'Motor error detected', { motorId: 2 });

// Flight logs
const flightLog = {
  id: 'flight-001',
  droneId: 'drone-001',
  startTime: new Date(),
  takeoffLocation: { latitude: 37.7749, longitude: -122.4194, altitude: 0 },
  events: [],
  errors: [],
  maxAltitude: 0,
  maxSpeed: 0,
  totalDistance: 0,
  averageBatteryUsage: 0,
};

logger.startFlightLog(flightLog);
logger.endFlightLog('flight-001', {
  endTime: new Date(),
  landingLocation: { latitude: 37.7749, longitude: -122.4194, altitude: 0 },
});
```

### 7. Error Handling & Recovery (`src/drone/recovery/`)

**DroneErrorHandler** - Automatic error recovery mechanisms:

```typescript
import { getErrorHandler, createDroneError, DroneErrorCode } from './drone';

const errorHandler = getErrorHandler({
  enableAutoRecovery: true,
  maxRetryAttempts: 3,
  enableEmergencyProtocols: true,
});

// Handle errors
const error = createDroneError(
  DroneErrorCode.GPS_SIGNAL_LOST,
  'GPS signal lost',
  'warning',
  true
);

const recoveryAction = await errorHandler.handleError(error, 'drone-001');
console.log('Recovery strategy:', recoveryAction?.strategy);

// Get error history
const history = errorHandler.getErrorHistory('drone-001');
```

Recovery strategies:
- **RETRY**: Retry failed operation with exponential backoff
- **RETURN_HOME**: Return to takeoff location
- **EMERGENCY_LAND**: Immediate landing at current location
- **HOVER_IN_PLACE**: Hold position until condition improves
- **ABORT_MISSION**: Cancel current mission
- **CONTINUE**: Continue operation despite error

### 8. Device Adapter (`src/drone/adapters/`)

**DroneAdapter** - Integration with privaseeAI device system:

```typescript
import { createDroneAdapter } from './drone';

const adapter = createDroneAdapter();

// Connect to drone
await adapter.connect({
  host: '192.168.1.100',
  port: 8889,
  droneId: 'drone-001',
  apiKey: 'your-api-key',
});

// Get status
const status = await adapter.getStatus();
console.log('Battery:', status.batteryLevel);

// Start surveillance
await adapter.startDetection();

// Send commands
await adapter.sendCommand({
  type: 'capture_image',
  timeout: 5000,
});

// Stop surveillance
await adapter.stopDetection();

// Disconnect
await adapter.disconnect();
```

## Environment Configuration

Add these variables to your `.env` file:

```bash
# Connection Settings
DRONE_HOST=localhost
DRONE_PORT=8889
DRONE_PROTOCOL=tcp
DRONE_API_KEY=your-api-key-here

# Flight Settings
DRONE_MAX_SPEED=15          # m/s
DRONE_MAX_ALTITUDE=120      # meters
DRONE_MAX_DISTANCE=500      # meters
DRONE_RTH_ALTITUDE=30       # meters

# Logging
DRONE_LOG_DIR=./logs/drone
```

## Usage Example

Complete example integrating all modules:

```typescript
import {
  createDroneController,
  getMissionPlanner,
  getEventEmitter,
  getLogger,
  LogLevel,
} from './drone';

// Initialize logger
const logger = getLogger({ logLevel: LogLevel.INFO });

// Initialize drone controller
const controller = createDroneController('drone-001');

// Set up event listeners
const eventEmitter = getEventEmitter();

eventEmitter.onTelemetryUpdate((event) => {
  console.log('Battery:', event.data.battery.percentage);
});

eventEmitter.onLowBattery((event) => {
  console.warn('Low battery warning:', event.data.percentage);
});

// Connect to drone
await controller.connect({
  host: '192.168.1.100',
  port: 8889,
});

// Create and validate mission
const planner = getMissionPlanner();
const mission = planner.createMission('Perimeter Survey', [
  { id: 'wp1', latitude: 37.7749, longitude: -122.4194, altitude: 30 },
  { id: 'wp2', latitude: 37.7750, longitude: -122.4195, altitude: 30 },
  { id: 'wp3', latitude: 37.7749, longitude: -122.4194, altitude: 30 },
]);

const validation = planner.validateMission(mission.id);
if (validation.isValid) {
  // Execute mission
  await controller.takeoff(5);
  
  for (const waypoint of mission.waypoints) {
    await controller.moveToPosition(
      waypoint.latitude,
      waypoint.longitude,
      waypoint.altitude
    );
    await controller.takePhoto();
  }
  
  await controller.land();
} else {
  console.error('Mission validation failed:', validation.errors);
}

// Disconnect
await controller.disconnect();
```

## Privacy & Security

This integration follows privaseeAI's privacy-first approach:

1. **Local-First**: All data is stored locally by default
2. **Encryption**: Flight logs can be encrypted at rest
3. **Retention**: Configurable auto-deletion of old data
4. **Authentication**: API key-based authentication for drone access
5. **Audit Logging**: All operations are logged for accountability

## Testing

The drone modules use placeholder implementations for SDK integration. To integrate with actual Autel SDK:

1. Install Autel EVO Lite SDK dependencies
2. Replace placeholder methods in `DroneController` with actual SDK calls
3. Update telemetry updates to use real SDK data
4. Implement camera and video streaming integration

## Future Enhancements

- Integration with actual Autel EVO Lite SDK
- Real-time video streaming from drone camera
- AI-powered object detection on drone footage
- Multi-drone coordination and swarm control
- Advanced mission planning with obstacle avoidance
- Integration with weather APIs for flight safety
- Mobile app for remote drone control
