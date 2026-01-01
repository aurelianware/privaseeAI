// Mission Planning Module
import {
  DroneMission,
  MissionWaypoint,
  MissionState,
  MissionStatus,
  WaypointActionType,
  DroneErrorCode,
} from '../types';
import { FlightLogger } from '../logger/FlightLogger';
import { DroneErrorHandler, createDroneError } from '../recovery/ErrorHandler';
import { DroneConfigManager } from '../config/DroneConfig';

/**
 * Mission validation result
 */
export interface MissionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * MissionPlanner - Handles mission creation, validation, and planning
 */
export class MissionPlanner {
  private static instance: MissionPlanner;
  private missions: Map<string, DroneMission> = new Map();
  private activeMissions: Map<string, MissionStatus> = new Map();
  private logger: FlightLogger;
  private errorHandler: DroneErrorHandler;
  private configManager: DroneConfigManager;

  private constructor() {
    this.logger = FlightLogger.getInstance();
    this.errorHandler = DroneErrorHandler.getInstance();
    this.configManager = DroneConfigManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MissionPlanner {
    if (!MissionPlanner.instance) {
      MissionPlanner.instance = new MissionPlanner();
    }
    return MissionPlanner.instance;
  }

  /**
   * Create a new mission
   */
  public createMission(
    name: string,
    waypoints: MissionWaypoint[],
    description?: string,
    options?: Partial<DroneMission['settings']>
  ): DroneMission {
    const mission: DroneMission = {
      id: this.generateMissionId(),
      name,
      description,
      waypoints,
      settings: {
        autoTakeoff: options?.autoTakeoff ?? true,
        autoLand: options?.autoLand ?? true,
        autoRTH: options?.autoRTH ?? true,
        maxSpeed: options?.maxSpeed ?? 10,
        maxAltitude: options?.maxAltitude ?? 100,
        finishAction: options?.finishAction ?? 'return_to_home',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.missions.set(mission.id, mission);
    this.logger.info('MISSION_PLANNER', `Mission created: ${mission.name}`, {
      missionId: mission.id,
      waypointCount: waypoints.length,
    });

    return mission;
  }

  /**
   * Validate mission
   */
  public validateMission(missionId: string): MissionValidationResult {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      return {
        isValid: false,
        errors: ['Mission not found'],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const flightSettings = this.configManager.getFlightSettings();

    // Validate waypoints
    if (mission.waypoints.length < 2) {
      errors.push('Mission must have at least 2 waypoints');
    }

    // Validate each waypoint
    mission.waypoints.forEach((waypoint, index) => {
      // Check altitude limits
      if (waypoint.altitude > mission.settings.maxAltitude) {
        errors.push(
          `Waypoint ${index + 1}: Altitude ${waypoint.altitude}m exceeds mission max ${mission.settings.maxAltitude}m`
        );
      }

      if (waypoint.altitude > flightSettings.maxAltitude) {
        errors.push(
          `Waypoint ${index + 1}: Altitude ${waypoint.altitude}m exceeds system max ${flightSettings.maxAltitude}m`
        );
      }

      if (waypoint.altitude < 5) {
        warnings.push(
          `Waypoint ${index + 1}: Low altitude (${waypoint.altitude}m) may be unsafe`
        );
      }

      // Check latitude/longitude validity
      if (waypoint.latitude < -90 || waypoint.latitude > 90) {
        errors.push(`Waypoint ${index + 1}: Invalid latitude ${waypoint.latitude}`);
      }

      if (waypoint.longitude < -180 || waypoint.longitude > 180) {
        errors.push(`Waypoint ${index + 1}: Invalid longitude ${waypoint.longitude}`);
      }

      // Check speed
      if (waypoint.speed && waypoint.speed > mission.settings.maxSpeed) {
        errors.push(
          `Waypoint ${index + 1}: Speed ${waypoint.speed}m/s exceeds mission max ${mission.settings.maxSpeed}m/s`
        );
      }

      if (waypoint.speed && waypoint.speed > flightSettings.maxSpeed) {
        errors.push(
          `Waypoint ${index + 1}: Speed ${waypoint.speed}m/s exceeds system max ${flightSettings.maxSpeed}m/s`
        );
      }
    });

    // Validate geofence if present
    if (mission.geofence) {
      if (mission.geofence.radius <= 0) {
        errors.push('Geofence radius must be positive');
      }

      if (mission.geofence.radius > flightSettings.maxDistance) {
        warnings.push(
          `Geofence radius ${mission.geofence.radius}m exceeds recommended max distance ${flightSettings.maxDistance}m`
        );
      }

      // Check if all waypoints are within geofence
      const center = mission.geofence.center;
      mission.waypoints.forEach((waypoint, index) => {
        const distance = this.calculateDistance(
          center.latitude,
          center.longitude,
          waypoint.latitude,
          waypoint.longitude
        );

        if (distance > mission.geofence!.radius) {
          errors.push(
            `Waypoint ${index + 1}: Outside geofence (${distance.toFixed(0)}m from center)`
          );
        }
      });
    }

    // Validate mission distance
    const totalDistance = this.calculateMissionDistance(mission);
    if (totalDistance > flightSettings.maxDistance * 2) {
      warnings.push(
        `Total mission distance (${totalDistance.toFixed(0)}m) is very long. Ensure battery is sufficient.`
      );
    }

    const isValid = errors.length === 0;

    this.logger.info('MISSION_PLANNER', `Mission validation completed: ${mission.name}`, {
      missionId: mission.id,
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return { isValid, errors, warnings };
  }

  /**
   * Add waypoint to mission
   */
  public addWaypoint(missionId: string, waypoint: MissionWaypoint, index?: number): boolean {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      this.logger.error('MISSION_PLANNER', `Mission not found: ${missionId}`);
      return false;
    }

    if (index !== undefined && index >= 0 && index <= mission.waypoints.length) {
      mission.waypoints.splice(index, 0, waypoint);
    } else {
      mission.waypoints.push(waypoint);
    }

    mission.updatedAt = new Date();
    
    this.logger.info('MISSION_PLANNER', `Waypoint added to mission: ${mission.name}`, {
      missionId,
      waypointId: waypoint.id,
      index: index ?? mission.waypoints.length - 1,
    });

    return true;
  }

  /**
   * Remove waypoint from mission
   */
  public removeWaypoint(missionId: string, waypointId: string): boolean {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      this.logger.error('MISSION_PLANNER', `Mission not found: ${missionId}`);
      return false;
    }

    const index = mission.waypoints.findIndex(wp => wp.id === waypointId);
    
    if (index === -1) {
      this.logger.error('MISSION_PLANNER', `Waypoint not found: ${waypointId}`);
      return false;
    }

    mission.waypoints.splice(index, 1);
    mission.updatedAt = new Date();
    
    this.logger.info('MISSION_PLANNER', `Waypoint removed from mission: ${mission.name}`, {
      missionId,
      waypointId,
    });

    return true;
  }

  /**
   * Update waypoint
   */
  public updateWaypoint(
    missionId: string,
    waypointId: string,
    updates: Partial<MissionWaypoint>
  ): boolean {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      this.logger.error('MISSION_PLANNER', `Mission not found: ${missionId}`);
      return false;
    }

    const waypoint = mission.waypoints.find(wp => wp.id === waypointId);
    
    if (!waypoint) {
      this.logger.error('MISSION_PLANNER', `Waypoint not found: ${waypointId}`);
      return false;
    }

    Object.assign(waypoint, updates);
    mission.updatedAt = new Date();
    
    this.logger.info('MISSION_PLANNER', `Waypoint updated in mission: ${mission.name}`, {
      missionId,
      waypointId,
    });

    return true;
  }

  /**
   * Set geofence for mission
   */
  public setGeofence(
    missionId: string,
    center: { latitude: number; longitude: number },
    radius: number,
    maxAltitude?: number
  ): boolean {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      this.logger.error('MISSION_PLANNER', `Mission not found: ${missionId}`);
      return false;
    }

    mission.geofence = {
      center,
      radius,
      maxAltitude: maxAltitude || mission.settings.maxAltitude,
    };

    mission.updatedAt = new Date();
    
    this.logger.info('MISSION_PLANNER', `Geofence set for mission: ${mission.name}`, {
      missionId,
      radius,
    });

    return true;
  }

  /**
   * Get mission by ID
   */
  public getMission(missionId: string): DroneMission | undefined {
    return this.missions.get(missionId);
  }

  /**
   * Get all missions
   */
  public getAllMissions(): DroneMission[] {
    return Array.from(this.missions.values());
  }

  /**
   * Delete mission
   */
  public deleteMission(missionId: string): boolean {
    const deleted = this.missions.delete(missionId);
    
    if (deleted) {
      this.logger.info('MISSION_PLANNER', `Mission deleted: ${missionId}`);
    }

    return deleted;
  }

  /**
   * Calculate mission distance
   */
  public calculateMissionDistance(mission: DroneMission): number {
    let totalDistance = 0;

    for (let i = 0; i < mission.waypoints.length - 1; i++) {
      const wp1 = mission.waypoints[i];
      const wp2 = mission.waypoints[i + 1];

      totalDistance += this.calculateDistance(
        wp1.latitude,
        wp1.longitude,
        wp2.latitude,
        wp2.longitude
      );
    }

    return totalDistance;
  }

  /**
   * Estimate mission duration
   */
  public estimateMissionDuration(mission: DroneMission): number {
    let totalTime = 0;
    const avgSpeed = mission.settings.maxSpeed * 0.7; // Assume 70% of max speed

    // Time for travel
    const distance = this.calculateMissionDistance(mission);
    totalTime += distance / avgSpeed;

    // Time for waypoint actions
    mission.waypoints.forEach(waypoint => {
      if (waypoint.dwellTime) {
        totalTime += waypoint.dwellTime;
      }

      waypoint.actions?.forEach(action => {
        // Add time for actions (rough estimates)
        switch (action.type) {
          case WaypointActionType.TAKE_PHOTO:
            totalTime += 2; // 2 seconds for photo
            break;
          case WaypointActionType.ROTATE:
            totalTime += 5; // 5 seconds for rotation
            break;
          case WaypointActionType.HOVER:
            totalTime += action.parameters?.duration || 5;
            break;
        }
      });
    });

    return Math.ceil(totalTime);
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Generate unique mission ID
   */
  private generateMissionId(): string {
    return `mission-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Export mission to JSON
   */
  public exportMission(missionId: string): string | null {
    const mission = this.missions.get(missionId);
    
    if (!mission) {
      return null;
    }

    return JSON.stringify(mission, null, 2);
  }

  /**
   * Import mission from JSON
   */
  public importMission(json: string): DroneMission | null {
    try {
      const mission = JSON.parse(json) as DroneMission;
      
      // Generate new ID for imported mission
      mission.id = this.generateMissionId();
      mission.createdAt = new Date();
      mission.updatedAt = new Date();

      this.missions.set(mission.id, mission);
      
      this.logger.info('MISSION_PLANNER', `Mission imported: ${mission.name}`, {
        missionId: mission.id,
      });

      return mission;
    } catch (error) {
      this.logger.error('MISSION_PLANNER', `Failed to import mission: ${error}`);
      return null;
    }
  }
}

/**
 * Helper function to get mission planner instance
 */
export function getMissionPlanner(): MissionPlanner {
  return MissionPlanner.getInstance();
}

/**
 * Helper function to create a simple mission
 */
export function createSimpleMission(
  name: string,
  waypoints: Array<{ lat: number; lon: number; alt: number }>
): DroneMission {
  const planner = getMissionPlanner();
  
  const missionWaypoints: MissionWaypoint[] = waypoints.map((wp, index) => ({
    id: `wp-${index}`,
    latitude: wp.lat,
    longitude: wp.lon,
    altitude: wp.alt,
  }));

  return planner.createMission(name, missionWaypoints);
}
