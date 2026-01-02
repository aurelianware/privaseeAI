# Drone SDK Setup Guide

Quick setup guide for integrating Autel EVO Lite drone with privaseeAI.

## Prerequisites

- Node.js 18+ and npm
- TypeScript 5.0+
- Autel EVO Lite drone
- Network connectivity between your computer and drone

## Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/aurelianware/privaseeAI.git
   cd privaseeAI
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your drone settings:
   ```env
   # Drone Connection
   DRONE_HOST=192.168.1.100
   DRONE_PORT=8889
   DRONE_PROTOCOL=tcp
   DRONE_API_KEY=your-api-key

   # Flight Settings
   DRONE_MAX_SPEED=15
   DRONE_MAX_ALTITUDE=120
   DRONE_MAX_DISTANCE=500
   DRONE_RTH_ALTITUDE=30

   # Logging
   DRONE_LOG_DIR=./logs/drone
   ```

3. **Create logs directory:**
   ```bash
   mkdir -p logs/drone
   ```

## Quick Start

### Basic Flight Control

```typescript
import { createDroneController } from './src/drone';

async function fly() {
  const drone = createDroneController('my-drone');
  
  await drone.connect({ 
    host: process.env.DRONE_HOST,
    port: parseInt(process.env.DRONE_PORT!)
  });
  
  await drone.takeoff(10); // 10 meters
  await drone.takePhoto();
  await drone.land();
  await drone.disconnect();
}

fly();
```

### Mission Planning

```typescript
import { getMissionPlanner } from './src/drone';

const planner = getMissionPlanner();

const mission = planner.createMission('Patrol', [
  { id: 'wp1', latitude: 37.7749, longitude: -122.4194, altitude: 30 },
  { id: 'wp2', latitude: 37.7750, longitude: -122.4195, altitude: 30 },
  { id: 'wp3', latitude: 37.7749, longitude: -122.4194, altitude: 20 },
]);

const validation = planner.validateMission(mission.id);
if (validation.isValid) {
  console.log('Mission ready!');
}
```

### Event Monitoring

```typescript
import { getEventEmitter } from './src/drone';

const events = getEventEmitter();

events.onTelemetryUpdate((event) => {
  console.log('Battery:', event.data.battery.percentage);
});

events.onLowBattery((event) => {
  console.warn('Low battery:', event.data.percentage);
});
```

## Running Examples

```bash
# Basic flight control
ts-node examples/drone/basic-flight.ts

# Mission planning
ts-node examples/drone/mission-planning.ts

# Event handling
ts-node examples/drone/event-handling.ts
```

## Integration with privaseeAI

Add drone as a surveillance device:

```typescript
import { createDroneAdapter } from './src/drone';

const adapter = createDroneAdapter();

await adapter.connect({
  host: '192.168.1.100',
  port: 8889,
  droneId: 'surveillance-drone-1',
});

// Start surveillance mode
await adapter.startDetection();
```

## Troubleshooting

### Connection Issues

If you can't connect to the drone:

1. Check drone is powered on and in range
2. Verify IP address and port
3. Check firewall settings
4. Ensure drone WiFi is connected

### Type Errors

If you get TypeScript errors:

```bash
npm install --save-dev @types/node
npm run type-check
```

### Missing Process

If `process.env` is undefined, ensure @types/node is installed:

```bash
npm install --save-dev @types/node
```

## Next Steps

- 📚 Read the [complete documentation](DRONE_INTEGRATION.md)
- 🔧 Explore [code examples](../examples/drone/)
- 🎯 Review [type definitions](../src/drone/types/)
- 🔍 Check [module README](../src/drone/README.md)

## Safety Checklist

Before flying:
- ✅ Check battery level (>30%)
- ✅ Verify GPS signal (>8 satellites)
- ✅ Set appropriate geofence
- ✅ Check weather conditions
- ✅ Clear flight area of obstacles
- ✅ Have manual override ready

## Support

For issues and questions:
- 📖 Documentation: [DRONE_INTEGRATION.md](DRONE_INTEGRATION.md)
- 🐛 Issues: [GitHub Issues](https://github.com/aurelianware/privaseeAI/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/aurelianware/privaseeAI/discussions)
