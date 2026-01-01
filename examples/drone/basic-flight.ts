/**
 * Basic Flight Control Example
 * 
 * This example demonstrates basic drone operations:
 * - Connecting to the drone
 * - Taking off
 * - Moving to a position
 * - Taking photos
 * - Landing
 * - Disconnecting
 */

import {
  createDroneController,
  getEventEmitter,
  getLogger,
  LogLevel,
} from '../src/drone';

async function basicFlightExample() {
  // Initialize logger
  const logger = getLogger({ logLevel: LogLevel.INFO });
  
  // Set up event listeners
  const eventEmitter = getEventEmitter();
  
  eventEmitter.onTelemetryUpdate((event) => {
    console.log('📊 Telemetry Update:');
    console.log('  Battery:', event.data.battery.percentage + '%');
    console.log('  Altitude:', event.data.position.relativeAltitude.toFixed(2), 'm');
    console.log('  GPS Satellites:', event.data.gps.satelliteCount);
  });
  
  eventEmitter.onLowBattery((event) => {
    console.warn('⚠️  LOW BATTERY WARNING:', event.data.percentage + '%');
  });
  
  // Create drone controller
  const controller = createDroneController('my-autel-drone');
  
  try {
    // Connect to drone
    console.log('🔌 Connecting to drone...');
    await controller.connect({
      host: '192.168.1.100',
      port: 8889,
      apiKey: 'your-api-key',
    });
    console.log('✅ Connected successfully!\n');
    
    // Wait a moment for telemetry to stabilize
    await sleep(2000);
    
    // Takeoff
    console.log('🚁 Taking off to 10 meters...');
    await controller.takeoff(10);
    console.log('✅ Takeoff complete!\n');
    
    // Wait at hover
    await sleep(3000);
    
    // Move to a position (example: 50 meters north, same altitude)
    console.log('📍 Moving to target position...');
    await controller.moveToPosition(
      37.7749,  // latitude
      -122.4194, // longitude
      10,        // altitude
      5          // speed (m/s)
    );
    console.log('✅ Position reached!\n');
    
    // Take a photo
    console.log('📸 Taking photo...');
    await controller.takePhoto();
    console.log('✅ Photo captured!\n');
    
    // Hover for a moment
    await sleep(2000);
    
    // Return to home
    console.log('🏠 Returning to home...');
    await controller.returnToHome();
    console.log('✅ Returned to home!\n');
    
    // Land
    console.log('🛬 Landing...');
    await controller.land();
    console.log('✅ Landed safely!\n');
    
  } catch (error) {
    console.error('❌ Error during flight:', error);
  } finally {
    // Disconnect
    console.log('🔌 Disconnecting...');
    await controller.disconnect();
    console.log('✅ Disconnected successfully!');
  }
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
if (require.main === module) {
  console.log('🚁 Autel EVO Lite - Basic Flight Control Example\n');
  console.log('================================================\n');
  
  basicFlightExample()
    .then(() => {
      console.log('\n✅ Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { basicFlightExample };
