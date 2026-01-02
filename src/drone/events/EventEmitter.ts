// Event Handling Module
import { DroneEvent, DroneEventType, DroneTelemetry } from '../types';
import { FlightLogger } from '../logger/FlightLogger';

/**
 * Event listener callback type
 */
export type EventListener<T = any> = (event: DroneEvent<T>) => void | Promise<void>;

/**
 * Event subscription
 */
export interface EventSubscription {
  id: string;
  eventType: DroneEventType | '*';
  callback: EventListener;
  droneId?: string; // Optional filter for specific drone
}

/**
 * DroneEventEmitter - Event handling for drone telemetry and events
 */
export class DroneEventEmitter {
  private static instance: DroneEventEmitter;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventHistory: DroneEvent[] = [];
  private logger: FlightLogger;
  private readonly MAX_HISTORY_SIZE = 1000;

  private constructor() {
    this.logger = FlightLogger.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DroneEventEmitter {
    if (!DroneEventEmitter.instance) {
      DroneEventEmitter.instance = new DroneEventEmitter();
    }
    return DroneEventEmitter.instance;
  }

  /**
   * Subscribe to events
   */
  public on<T = any>(
    eventType: DroneEventType | '*',
    callback: EventListener<T>,
    droneId?: string
  ): string {
    const subscription: EventSubscription = {
      id: this.generateSubscriptionId(),
      eventType,
      callback: callback as EventListener,
      droneId,
    };

    this.subscriptions.set(subscription.id, subscription);

    this.logger.debug('EVENT_EMITTER', `Subscription added for ${eventType}`, {
      subscriptionId: subscription.id,
      droneId,
    });

    return subscription.id;
  }

  /**
   * Subscribe to connection events
   */
  public onConnectionChanged(
    callback: EventListener<{ state: string }>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.CONNECTION_CHANGED, callback, droneId);
  }

  /**
   * Subscribe to telemetry updates
   */
  public onTelemetryUpdate(
    callback: EventListener<DroneTelemetry>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.TELEMETRY_UPDATE, callback, droneId);
  }

  /**
   * Subscribe to mission events
   */
  public onMissionStarted(
    callback: EventListener<{ missionId: string }>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.MISSION_STARTED, callback, droneId);
  }

  /**
   * Subscribe to low battery events
   */
  public onLowBattery(
    callback: EventListener<{ percentage: number }>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.LOW_BATTERY, callback, droneId);
  }

  /**
   * Subscribe to error events
   */
  public onError(
    callback: EventListener<{ code: string; message: string }>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.ERROR, callback, droneId);
  }

  /**
   * Subscribe to obstacle detection events
   */
  public onObstacleDetected(
    callback: EventListener<{ distance: number; direction: string }>,
    droneId?: string
  ): string {
    return this.on(DroneEventType.OBSTACLE_DETECTED, callback, droneId);
  }

  /**
   * Unsubscribe from events
   */
  public off(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);

    if (deleted) {
      this.logger.debug('EVENT_EMITTER', `Subscription removed: ${subscriptionId}`);
    }

    return deleted;
  }

  /**
   * Emit event
   */
  public async emit<T = any>(event: DroneEvent<T>): Promise<void> {
    // Add to history
    this.addToHistory(event);

    // Log the event
    this.logger.logEvent(event);

    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
      sub =>
        (sub.eventType === '*' || sub.eventType === event.type) &&
        (!sub.droneId || sub.droneId === event.droneId)
    );

    // Execute callbacks
    const promises = matchingSubscriptions.map(async sub => {
      try {
        await sub.callback(event);
      } catch (error) {
        this.logger.error('EVENT_EMITTER', `Error in event callback: ${error}`, {
          subscriptionId: sub.id,
          eventType: event.type,
        });
      }
    });

    await Promise.all(promises);

    this.logger.debug('EVENT_EMITTER', `Event emitted: ${event.type}`, {
      droneId: event.droneId,
      listenerCount: matchingSubscriptions.length,
    });
  }

  /**
   * Create and emit connection changed event
   */
  public async emitConnectionChanged(
    droneId: string,
    state: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info'
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.CONNECTION_CHANGED,
      timestamp: new Date(),
      droneId,
      data: { state },
      severity,
    });
  }

  /**
   * Create and emit telemetry update event
   */
  public async emitTelemetryUpdate(
    droneId: string,
    telemetry: DroneTelemetry
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.TELEMETRY_UPDATE,
      timestamp: new Date(),
      droneId,
      data: telemetry,
      severity: 'info',
    });
  }

  /**
   * Create and emit mission started event
   */
  public async emitMissionStarted(
    droneId: string,
    missionId: string
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.MISSION_STARTED,
      timestamp: new Date(),
      droneId,
      data: { missionId },
      severity: 'info',
    });
  }

  /**
   * Create and emit mission completed event
   */
  public async emitMissionCompleted(
    droneId: string,
    missionId: string,
    stats?: any
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.MISSION_COMPLETED,
      timestamp: new Date(),
      droneId,
      data: { missionId, stats },
      severity: 'info',
    });
  }

  /**
   * Create and emit low battery event
   */
  public async emitLowBattery(
    droneId: string,
    percentage: number
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.LOW_BATTERY,
      timestamp: new Date(),
      droneId,
      data: { percentage },
      severity: 'warning',
    });
  }

  /**
   * Create and emit critical battery event
   */
  public async emitCriticalBattery(
    droneId: string,
    percentage: number
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.CRITICAL_BATTERY,
      timestamp: new Date(),
      droneId,
      data: { percentage },
      severity: 'critical',
    });
  }

  /**
   * Create and emit error event
   */
  public async emitError(
    droneId: string,
    code: string,
    message: string,
    details?: any
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.ERROR,
      timestamp: new Date(),
      droneId,
      data: { code, message, details },
      severity: 'error',
    });
  }

  /**
   * Create and emit obstacle detected event
   */
  public async emitObstacleDetected(
    droneId: string,
    distance: number,
    direction: string
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.OBSTACLE_DETECTED,
      timestamp: new Date(),
      droneId,
      data: { distance, direction },
      severity: 'warning',
    });
  }

  /**
   * Create and emit camera photo taken event
   */
  public async emitPhotoTaken(
    droneId: string,
    photoData: any
  ): Promise<void> {
    await this.emit({
      type: DroneEventType.CAMERA_PHOTO_TAKEN,
      timestamp: new Date(),
      droneId,
      data: photoData,
      severity: 'info',
    });
  }

  /**
   * Get event history
   */
  public getEventHistory(
    droneId?: string,
    eventType?: DroneEventType,
    limit: number = 100
  ): DroneEvent[] {
    let events = this.eventHistory;

    // Filter by drone ID
    if (droneId) {
      events = events.filter(e => e.droneId === droneId);
    }

    // Filter by event type
    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }

    // Return most recent events
    return events.slice(-limit);
  }

  /**
   * Clear event history
   */
  public clearHistory(droneId?: string): void {
    if (droneId) {
      this.eventHistory = this.eventHistory.filter(e => e.droneId !== droneId);
    } else {
      this.eventHistory = [];
    }
  }

  /**
   * Get active subscriptions
   */
  public getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription count for event type
   */
  public getSubscriptionCount(eventType?: DroneEventType): number {
    if (!eventType) {
      return this.subscriptions.size;
    }

    return Array.from(this.subscriptions.values()).filter(
      sub => sub.eventType === eventType || sub.eventType === '*'
    ).length;
  }

  /**
   * Remove all subscriptions
   */
  public removeAllSubscriptions(droneId?: string): void {
    if (droneId) {
      const toRemove = Array.from(this.subscriptions.entries())
        .filter(([_, sub]) => sub.droneId === droneId)
        .map(([id, _]) => id);

      toRemove.forEach(id => this.subscriptions.delete(id));
    } else {
      this.subscriptions.clear();
    }
  }

  /**
   * Add event to history
   */
  private addToHistory(event: DroneEvent): void {
    this.eventHistory.push(event);

    // Maintain max history size
    if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
      this.eventHistory.shift();
    }
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Helper function to get event emitter instance
 */
export function getEventEmitter(): DroneEventEmitter {
  return DroneEventEmitter.getInstance();
}

/**
 * Helper function to create event listeners
 */
export function createEventListener<T = any>(
  callback: EventListener<T>
): EventListener<T> {
  return callback;
}
