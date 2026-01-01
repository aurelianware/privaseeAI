/**
 * Mission Planning Example
 * 
 * This example demonstrates:
 * - Creating a waypoint mission
 * - Validating the mission
 * - Setting a geofence
 * - Executing the mission
 * - Monitoring mission progress
 */

import {
  createDroneController,
  getMissionPlanner,
  getEventEmitter,
  getLogger,
  LogLevel,
  WaypointActionType,
} from '../src/drone';

async function missionPlanningExample() {
  const logger = getLogger({ logLevel: LogLevel.INFO });
  const planner = getMissionPlanner();
  const eventEmitter = getEventEmitter();
  const controller = createDroneController('mission-drone');
  
  // Set up mission event listeners
  eventEmitter.onMissionStarted((event) => {
    console.log('🚀 Mission started:', event.data.missionId);
  });
  
  eventEmitter.on('waypoint_reached', (event) => {
    console.log('📍 Waypoint reached:', event.data);
  });
  
  try {
    // Create a surveillance mission with multiple waypoints
    console.log('📋 Creating surveillance mission...\n');
    
    const mission = planner.createMission(
      'Perimeter Surveillance',
      [
        {
          id: 'wp1',
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 30,
          speed: 8,
          actions: [
            { type: WaypointActionType.TAKE_PHOTO },
            { type: WaypointActionType.HOVER, parameters: { duration: 5 } },
          ],
        },
        {
          id: 'wp2',
          latitude: 37.7750,
          longitude: -122.4195,
          altitude: 30,
          speed: 8,
          actions: [
            { type: WaypointActionType.START_RECORDING },
          ],
        },
        {
          id: 'wp3',
          latitude: 37.7751,
          longitude: -122.4196,
          altitude: 35,
          speed: 10,
          gimbalPitch: -45, // Look down at 45 degrees
          actions: [
            { type: WaypointActionType.TAKE_PHOTO },
          ],
        },
        {
          id: 'wp4',
          latitude: 37.7752,
          longitude: -122.4195,
          altitude: 30,
          speed: 8,
          actions: [
            { type: WaypointActionType.STOP_RECORDING },
            { type: WaypointActionType.TAKE_PHOTO },
          ],
        },
        {
          id: 'wp5',
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 20,
          speed: 5,
          actions: [
            { type: WaypointActionType.TAKE_PHOTO },
          ],
        },
      ],
      'Automated perimeter surveillance with photo capture',
      {
        autoTakeoff: true,
        autoLand: true,
        autoRTH: true,
        maxSpeed: 12,
        maxAltitude: 50,
        finishAction: 'return_to_home',
      }
    );
    
    console.log('✅ Mission created:', mission.name);
    console.log('   Waypoints:', mission.waypoints.length);
    console.log('   Auto takeoff:', mission.settings.autoTakeoff);
    console.log('   Auto land:', mission.settings.autoLand);
    console.log('   Finish action:', mission.settings.finishAction, '\n');
    
    // Set a geofence for safety
    console.log('🛡️  Setting geofence...');
    planner.setGeofence(
      mission.id,
      { latitude: 37.7750, longitude: -122.4195 },
      300, // 300 meter radius
      50   // 50 meter max altitude
    );
    console.log('✅ Geofence set: 300m radius, 50m max altitude\n');
    
    // Validate the mission
    console.log('✔️  Validating mission...');
    const validation = planner.validateMission(mission.id);
    
    if (validation.isValid) {
      console.log('✅ Mission validation passed!');
    } else {
      console.error('❌ Mission validation failed!');
      console.error('Errors:', validation.errors);
      return;
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Warnings:', validation.warnings);
    }
    
    // Calculate mission statistics
    const distance = planner.calculateMissionDistance(mission);
    const duration = planner.estimateMissionDuration(mission);
    
    console.log('\n📊 Mission Statistics:');
    console.log('   Total distance:', distance.toFixed(0), 'meters');
    console.log('   Estimated duration:', Math.floor(duration / 60), 'min', duration % 60, 'sec');
    console.log('   Waypoints:', mission.waypoints.length);
    console.log('   Average speed:', (distance / duration).toFixed(1), 'm/s\n');
    
    // Connect to drone
    console.log('🔌 Connecting to drone...');
    await controller.connect({
      host: '192.168.1.100',
      port: 8889,
    });
    console.log('✅ Connected!\n');
    
    // In a real implementation, you would execute the mission here
    // For this example, we'll just show the mission is ready
    console.log('🚁 Mission ready for execution!');
    console.log('   Mission ID:', mission.id);
    console.log('   Starting waypoint:', mission.waypoints[0].id);
    console.log('   Ending waypoint:', mission.waypoints[mission.waypoints.length - 1].id);
    
    // Export mission for backup
    const missionJson = planner.exportMission(mission.id);
    console.log('\n💾 Mission exported to JSON (length:', missionJson?.length, 'chars)');
    
    // Simulate mission execution (in real implementation, this would be actual flight)
    console.log('\n▶️  Simulating mission execution...\n');
    
    for (let i = 0; i < mission.waypoints.length; i++) {
      const wp = mission.waypoints[i];
      console.log(`📍 Waypoint ${i + 1}/${mission.waypoints.length}: ${wp.id}`);
      console.log(`   Position: ${wp.latitude.toFixed(4)}, ${wp.longitude.toFixed(4)}, ${wp.altitude}m`);
      console.log(`   Actions: ${wp.actions?.length || 0}`);
      
      // Simulate waypoint actions
      if (wp.actions) {
        for (const action of wp.actions) {
          console.log(`   ⚡ ${action.type}`);
        }
      }
      
      await sleep(2000); // Simulate travel time
    }
    
    console.log('\n✅ Mission completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during mission:', error);
  } finally {
    await controller.disconnect();
    console.log('🔌 Disconnected');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
if (require.main === module) {
  console.log('🚁 Autel EVO Lite - Mission Planning Example\n');
  console.log('===========================================\n');
  
  missionPlanningExample()
    .then(() => {
      console.log('\n✅ Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { missionPlanningExample };
