/**
 * Event Dispatcher Service
 * Handles events from privaseeAI cameras and coordinates drone responses
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';

export interface CameraEvent {
  id: string;
  timestamp: Date;
  cameraId: string;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  threatType: 'motion' | 'person' | 'vehicle' | 'unknown' | 'alarm';
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  snapshotUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DroneResponse {
  eventId: string;
  droneId: string;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  missionId?: string;
  approvalRequired: boolean;
  approvalExpiry?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class EventDispatcher extends EventEmitter {
  private eventQueue: Map<string, CameraEvent> = new Map();
  private droneResponses: Map<string, DroneResponse> = new Map();
  private threatThresholds = {
    low: 0.3,
    medium: 0.6,
    high: 0.8,
    critical: 0.95,
  };

  constructor() {
    super();
    logger.info('EventDispatcher initialized');
  }

  /**
   * Process an incoming camera event
   */
  async processEvent(event: CameraEvent): Promise<void> {
    try {
      logger.info(`Processing event ${event.id} from camera ${event.cameraId}`, {
        threatLevel: event.threatLevel,
        threatType: event.threatType,
      });

      // Store event
      this.eventQueue.set(event.id, event);

      // Determine if drone response is needed
      const shouldTriggerDrone = this.shouldTriggerDrone(event);

      if (shouldTriggerDrone) {
        // Emit drone trigger event for subscribers
        this.emit('drone-trigger', {
          eventId: event.id,
          location: event.location,
          threatLevel: event.threatLevel,
          threatType: event.threatType,
          snapshotUrl: event.snapshotUrl,
        });

        logger.info(`Drone trigger emitted for event ${event.id}`);
      } else {
        logger.debug(`Event ${event.id} did not meet threshold for drone trigger`);
      }
    } catch (error) {
      logger.error(`Error processing event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Determine if a drone should be triggered based on threat level and type
   */
  private shouldTriggerDrone(event: CameraEvent): boolean {
    // Only trigger for medium+ threat levels
    const threatLevels = ['low', 'medium', 'high', 'critical'];
    const threatIndex = threatLevels.indexOf(event.threatLevel);

    // Trigger for medium and above
    if (threatIndex >= 1) {
      return true;
    }

    // For low threat, only trigger certain types (e.g., vehicles, people at night)
    if (event.threatLevel === 'low' && ['vehicle', 'person'].includes(event.threatType)) {
      return false; // Configurable logic
    }

    return false;
  }

  /**
   * Record a drone response to an event
   */
  recordDroneResponse(response: DroneResponse): void {
    this.droneResponses.set(response.eventId, response);
    this.emit('drone-response-recorded', response);
    logger.info(`Drone response recorded for event ${response.eventId}`, {
      status: response.status,
      missionId: response.missionId,
    });
  }

  /**
   * Update drone response status
   */
  updateDroneResponse(eventId: string, updates: Partial<DroneResponse>): void {
    const response = this.droneResponses.get(eventId);
    if (!response) {
      logger.warn(`No drone response found for event ${eventId}`);
      return;
    }

    const updated = { ...response, ...updates, updatedAt: new Date() };
    this.droneResponses.set(eventId, updated);
    this.emit('drone-response-updated', updated);

    logger.info(`Drone response updated for event ${eventId}`, {
      status: updated.status,
    });
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): CameraEvent | undefined {
    return this.eventQueue.get(eventId);
  }

  /**
   * Get drone response for event
   */
  getDroneResponse(eventId: string): DroneResponse | undefined {
    return this.droneResponses.get(eventId);
  }

  /**
   * Get all pending events requiring approval
   */
  getPendingApprovals(): DroneResponse[] {
    const now = new Date();
    return Array.from(this.droneResponses.values()).filter(
      (response) =>
        response.status === 'pending' &&
        response.approvalRequired &&
        (!response.approvalExpiry || response.approvalExpiry > now)
    );
  }

  /**
   * Approve a drone response
   */
  approveDroneResponse(eventId: string): void {
    this.updateDroneResponse(eventId, {
      status: 'approved',
      approvalExpiry: undefined,
    });
    this.emit('drone-approved', { eventId });
  }

  /**
   * Reject a drone response
   */
  rejectDroneResponse(eventId: string, reason?: string): void {
    this.updateDroneResponse(eventId, {
      status: 'cancelled',
      error: reason || 'User rejected drone response',
    });
    this.emit('drone-rejected', { eventId, reason });
  }

  /**
   * Clear old events (cleanup)
   */
  clearOldEvents(olderThanMinutes: number = 1440): number {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    let removed = 0;

    for (const [key, event] of this.eventQueue.entries()) {
      if (event.timestamp < cutoff) {
        this.eventQueue.delete(key);
        removed++;
      }
    }

    logger.info(`Cleared ${removed} old events (older than ${olderThanMinutes} minutes)`);
    return removed;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalEvents: this.eventQueue.size,
      totalResponses: this.droneResponses.size,
      pendingApprovals: this.getPendingApprovals().length,
      responsesByStatus: {
        pending: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'pending'
        ).length,
        approved: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'approved'
        ).length,
        executing: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'executing'
        ).length,
        completed: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'completed'
        ).length,
        failed: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'failed'
        ).length,
        cancelled: Array.from(this.droneResponses.values()).filter(
          (r) => r.status === 'cancelled'
        ).length,
      },
    };
  }
}

export default new EventDispatcher();
