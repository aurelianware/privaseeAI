/**
 * Event Handling Example
 * 
 * This example demonstrates:
 * - Subscribing to various drone events
 * - Handling telemetry updates
 * - Responding to errors and warnings
 * - Event history tracking
 */

import {
  createDroneController,
  getEventEmitter,
  getLogger,
  LogLevel,
  DroneEventType,
} from '../src/drone';

async function eventHandlingExample() {
  const logger = getLogger({ logLevel: LogLevel.DEBUG });
  const eventEmitter = getEventEmitter();
  const controller = createDroneController('event-demo-drone');
  
  console.log('📡 Setting up event listeners...\n');
  
  // Subscribe to all events (wildcard)
  const allEventsId = eventEmitter.on('*', (event) => {
    console.log('📢 [ALL EVENTS]', event.type, '- Severity:', event.severity);
  });
  
  // Subscribe to specific events
  const telemetryId = eventEmitter.onTelemetryUpdate((event) => {
    const telemetry = event.data;
    console.log('📊 [TELEMETRY]');
    console.log('   Battery:', telemetry.battery.percentage + '%');
    console.log('   Position: Lat', telemetry.position.latitude.toFixed(6),
                'Lon', telemetry.position.longitude.toFixed(6),
                'Alt', telemetry.position.relativeAltitude.toFixed(2) + 'm');
    console.log('   Flight Mode:', telemetry.flightMode);
    console.log('   GPS Satellites:', telemetry.gps.satelliteCount);
  });
  
  const lowBatteryId = eventEmitter.onLowBattery((event) => {
    console.warn('⚠️  [LOW BATTERY] Level:', event.data.percentage + '%');
  });
  
  const criticalBatteryId = eventEmitter.on(DroneEventType.CRITICAL_BATTERY, (event) => {
    console.error('🔴 [CRITICAL BATTERY] Level:', event.data.percentage + '%');
    console.error('🔴 IMMEDIATE LANDING REQUIRED!');
  });
  
  const connectionId = eventEmitter.onConnectionChanged((event) => {
    console.log('🔌 [CONNECTION]', event.data.state.toUpperCase());
  });
  
  const errorId = eventEmitter.onError((event) => {
    console.error('❌ [ERROR]', event.data.code + ':', event.data.message);
  });
  
  const obstacleId = eventEmitter.onObstacleDetected((event) => {
    console.warn('🚧 [OBSTACLE]', event.data.direction,
                 'at', event.data.distance.toFixed(1) + 'm');
  });
  
  const missionStartId = eventEmitter.onMissionStarted((event) => {
    console.log('🚀 [MISSION STARTED]', event.data.missionId);
  });
  
  console.log('✅ Event listeners registered:', {
    all: allEventsId,
    telemetry: telemetryId,
    lowBattery: lowBatteryId,
    criticalBattery: criticalBatteryId,
    connection: connectionId,
    error: errorId,
    obstacle: obstacleId,
    missionStart: missionStartId,
  });
  console.log('📊 Active subscriptions:', eventEmitter.getSubscriptionCount());
  console.log();
  
  try {
    // Connect to drone
    console.log('🔌 Connecting to drone...');
    await controller.connect({
      host: '192.168.1.100',
      port: 8889,
    });
    
    // Wait for telemetry updates
    console.log('\n⏳ Monitoring drone for 10 seconds...\n');
    await sleep(10000);
    
    // Demonstrate manual event emission
    console.log('\n🧪 Testing manual event emission...\n');
    
    await eventEmitter.emitLowBattery('event-demo-drone', 25);
    await sleep(1000);
    
    await eventEmitter.emitObstacleDetected('event-demo-drone', 5.2, 'front');
    await sleep(1000);
    
    await eventEmitter.emitError('event-demo-drone', 'TEST_ERROR', 'This is a test error');
    await sleep(1000);
    
    // Get event history
    console.log('\n📜 Event History:');
    const history = eventEmitter.getEventHistory('event-demo-drone', undefined, 10);
    console.log('   Total events (last 10):', history.length);
    
    history.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.type} - ${event.severity} - ${event.timestamp.toISOString()}`);
    });
    
    // Get event statistics
    console.log('\n📈 Event Statistics:');
    const telemetryEvents = eventEmitter.getEventHistory(
      'event-demo-drone',
      DroneEventType.TELEMETRY_UPDATE
    );
    const errorEvents = eventEmitter.getEventHistory(
      'event-demo-drone',
      DroneEventType.ERROR
    );
    
    console.log('   Telemetry updates:', telemetryEvents.length);
    console.log('   Errors:', errorEvents.length);
    console.log('   Total subscriptions:', eventEmitter.getSubscriptions().length);
    
    // Demonstrate unsubscribing
    console.log('\n🔕 Unsubscribing from all events...');
    eventEmitter.off(allEventsId);
    eventEmitter.off(telemetryId);
    eventEmitter.off(lowBatteryId);
    eventEmitter.off(criticalBatteryId);
    eventEmitter.off(connectionId);
    eventEmitter.off(errorId);
    eventEmitter.off(obstacleId);
    eventEmitter.off(missionStartId);
    
    console.log('✅ Unsubscribed from all events');
    console.log('📊 Active subscriptions:', eventEmitter.getSubscriptionCount());
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await controller.disconnect();
    console.log('\n🔌 Disconnected');
    
    // Clear event history for cleanup
    eventEmitter.clearHistory('event-demo-drone');
    console.log('🗑️  Event history cleared');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
if (require.main === module) {
  console.log('🚁 Autel EVO Lite - Event Handling Example\n');
  console.log('=========================================\n');
  
  eventHandlingExample()
    .then(() => {
      console.log('\n✅ Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { eventHandlingExample };
