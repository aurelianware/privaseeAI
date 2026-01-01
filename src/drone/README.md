# Drone Module

Node.js/TypeScript module for integrating Autel EVO Lite drone SDK with privaseeAI.

## Quick Start

```typescript
import { createDroneController } from './drone';

const controller = createDroneController('my-drone');
await controller.connect({ host: '192.168.1.100', port: 8889 });
await controller.takeoff(10);
await controller.land();
await controller.disconnect();
```

## Module Structure

```
drone/
├── types/              # TypeScript definitions
├── config/             # Configuration management
├── control/            # Flight control
├── missions/           # Mission planning
├── events/             # Event handling
├── logger/             # Logging system
├── recovery/           # Error recovery
├── adapters/           # privaseeAI integration
└── index.ts            # Main exports
```

## Key Features

- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Modular**: Separate concerns for control, planning, logging, and recovery
- **Event-Driven**: Real-time telemetry and event notifications
- **Error Recovery**: Automatic recovery from common failure scenarios
- **Mission Planning**: Waypoint-based autonomous missions with validation
- **Privacy-Focused**: Encrypted logging, local storage, configurable retention
- **Device Integration**: Seamless integration with privaseeAI device system

## Documentation

See [DRONE_INTEGRATION.md](../../docs/DRONE_INTEGRATION.md) for complete documentation.

## Environment Variables

```bash
DRONE_HOST=localhost
DRONE_PORT=8889
DRONE_API_KEY=your-api-key
DRONE_MAX_SPEED=15
DRONE_MAX_ALTITUDE=120
DRONE_LOG_DIR=./logs/drone
```

## License

MIT
