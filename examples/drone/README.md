# Drone SDK Examples

This directory contains practical examples demonstrating how to use the Autel EVO Lite drone SDK integration.

## Examples

### 1. Basic Flight Control (`basic-flight.ts`)

Demonstrates fundamental drone operations:
- Connecting to the drone
- Taking off and landing
- Moving to GPS coordinates
- Taking photos
- Returning to home

**Run:**
```bash
ts-node examples/drone/basic-flight.ts
```

### 2. Mission Planning (`mission-planning.ts`)

Shows how to create and execute autonomous missions:
- Creating waypoint missions
- Adding actions to waypoints (photos, recordings, hovering)
- Setting geofences for safety
- Mission validation
- Calculating mission statistics

**Run:**
```bash
ts-node examples/drone/mission-planning.ts
```

### 3. Event Handling (`event-handling.ts`)

Demonstrates the event-driven architecture:
- Subscribing to telemetry updates
- Handling battery warnings
- Error and obstacle detection
- Event history tracking
- Subscription management

**Run:**
```bash
ts-node examples/drone/event-handling.ts
```

## Prerequisites

Before running the examples:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file with your drone connection settings:
   ```bash
   DRONE_HOST=192.168.1.100
   DRONE_PORT=8889
   DRONE_API_KEY=your-api-key
   ```

3. **Ensure drone is powered on and ready to connect**

## Notes

- These examples use **placeholder implementations** for actual drone SDK calls
- To integrate with real Autel EVO Lite hardware:
  1. Install the official Autel SDK
  2. Replace placeholder methods in `src/drone/control/DroneController.ts`
  3. Update telemetry methods to use real SDK data
  4. Implement camera streaming integration

## Safety

⚠️ **Important Safety Reminders:**
- Always test in a safe, open area away from people and obstacles
- Ensure you have proper authorization to fly
- Check battery level before flight
- Set appropriate geofences
- Monitor weather conditions
- Have a safety pilot ready to take manual control if needed

## Integration with privaseeAI

These examples can be integrated with the privaseeAI surveillance system:

```typescript
import { createDroneAdapter } from '../src/drone';

const adapter = createDroneAdapter();
await adapter.connect({
  host: '192.168.1.100',
  port: 8889,
  droneId: 'surveillance-drone-1',
});

// Start surveillance mode
await adapter.startDetection();
```

## Further Reading

- [Full Documentation](../../docs/DRONE_INTEGRATION.md)
- [Drone Module README](../../src/drone/README.md)
- [Type Definitions](../../src/drone/types/index.ts)
