import AutelDroneSDK, {
  MissionPlanningInput,
  MissionPlanResult,
  CameraFrame,
  WaypointMission,
  MissionEvent
} from './AutelDroneSDK';

export type FlightPhase =
  | 'idle'
  | 'preflight'
  | 'planning'
  | 'launching'
  | 'flying'
  | 'returning'
  | 'landing'
  | 'complete'
  | 'error';

export interface ThreatEvent {
  id: string;
  location: { latitude: number; longitude: number };
  snapshotUrl?: string;
  threatLevel: number;
}

export interface OrchestratorConfig {
  weatherApiUrl?: string;
  weatherApiKey?: string;
  airspaceApiUrl?: string;
  minBatteryPct?: number;
  minSatellites?: number;
  notify: (message: string, data?: unknown) => Promise<void>;
  saveLog: (entry: Record<string, unknown>) => Promise<void>;
  saveMedia: (frames: CameraFrame[]) => Promise<void>;
  runDetection: (frame: CameraFrame) => Promise<void>;
  broadcastFrame?: (frame: CameraFrame) => Promise<void> | void;
}

export class FlightOrchestrator {
  private phase: FlightPhase = 'idle';
  private readonly drone: AutelDroneSDK;
  private readonly config: OrchestratorConfig;
  private monitorTimer: NodeJS.Timeout | null = null;
  private activeFrames: CameraFrame[] = [];

  constructor(drone: AutelDroneSDK, config: OrchestratorConfig) {
    this.drone = drone;
    this.config = config;
  }

  public getPhase(): FlightPhase {
    return this.phase;
  }

  public async handleThreat(event: ThreatEvent): Promise<void> {
    try {
      this.setPhase('preflight');
      const preflight = await this.drone.validatePreFlight({
        location: event.location,
        weatherApiUrl: this.config.weatherApiUrl,
        weatherApiKey: this.config.weatherApiKey,
        airspaceApiUrl: this.config.airspaceApiUrl,
        minBatteryPct: this.config.minBatteryPct,
        minSatellites: this.config.minSatellites
      });

      if (!preflight.ok) {
        await this.config.notify('Preflight failed', { reasons: preflight.reasons, eventId: event.id });
        await this.config.saveLog({ type: 'preflight_failed', eventId: event.id, reasons: preflight.reasons, details: preflight.details });
        this.setPhase('error');
        return;
      }

      this.setPhase('planning');
      const mission = await this.planMission(event);
      // this.currentMission = mission; // Removed as unused

      this.setPhase('launching');
      await this.ensureAirborne();

      this.setPhase('flying');
      await this.startMission(mission.mission);

      this.startMonitoring(event.id);
      this.startStreaming();

      await this.awaitMissionCompletionWithEvents(event.id);

      await this.finishMission('complete', event.id);
    } catch (error) {
      await this.config.saveLog({ type: 'orchestrator_error', error: String(error) });
      this.setPhase('error');
      await this.safeReturnHome();
    }
  }

  private async planMission(event: ThreatEvent): Promise<MissionPlanResult> {
    const plan: MissionPlanningInput = {
      template: 'investigate',
      threatLocation: event.location,
      cruiseAltitude: 60,
      cruiseSpeed: 8,
      orbitRadiusMeters: 30
    };
    const mission = await this.drone.planMission(plan);
    await this.config.saveLog({ type: 'mission_planned', eventId: event.id, mission });
    return mission;
  }

  private async ensureAirborne(): Promise<void> {
    const status = await this.drone.getStatus();
    if (!status.isFlying) {
      await this.drone.takeoff(10);
    }
  }

  private async startMission(mission: WaypointMission): Promise<void> {
    await this.drone.startWaypointMission(mission);
  }

  private startMonitoring(eventId: string): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(async () => {
      try {
        const progress = this.drone.getMissionProgress();
        await this.config.saveLog({ type: 'progress', eventId, progress, phase: this.phase });
      } catch (error) {
        await this.config.saveLog({ type: 'progress_error', eventId, error: String(error) });
      }
    }, 2000);
  }

  private startStreaming(): void {
    this.activeFrames = [];
    this.drone.startCameraStream(
      { cameraType: 'both', resolution: '1080p', frameRate: 30 },
      async (frame) => {
        this.activeFrames.push(frame);
        // keep buffer light
        if (this.activeFrames.length > 120) {
          this.activeFrames.shift();
        }
        // run AI detection asynchronously
        this.config.runDetection(frame).catch(err => {
          console.error('Detection error', err);
        });
        // broadcast frame to dashboard listeners if available
        if (this.config.broadcastFrame) {
          this.config.broadcastFrame(frame);
        }
      }
    ).catch(err => console.error('Stream start failed', err));
  }

  private async awaitMissionCompletionWithEvents(eventId: string): Promise<void> {
    const unsubscribe = this.drone.onMissionEvent(async (evt: MissionEvent) => {
      if (evt.type === 'waypoint-reached') {
        await this.config.saveLog({ type: 'waypoint', eventId, waypoint: evt.waypointIndex });
      }
    });

    return new Promise((resolve, reject) => {
      const off = this.drone.onMissionEvent((evt: MissionEvent) => {
        if (evt.type === 'mission-complete') {
          off();
          unsubscribe();
          resolve();
        }
        if (evt.type === 'mission-error') {
          off();
          unsubscribe();
          reject(new Error(evt.error || 'Mission error'));
        }
      });
    });
  }

  private async finishMission(finalPhase: FlightPhase, eventId: string): Promise<void> {
    this.setPhase('returning');
    await this.safeReturnHome();
    this.setPhase('landing');
    // Landing assumed handled by returnToHome sequence
    this.setPhase(finalPhase);
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    await this.flushMedia(eventId);
    await this.config.notify('Mission complete', { eventId, phase: finalPhase });
  }

  private async safeReturnHome(): Promise<void> {
    try {
      await this.drone.returnToHome();
    } catch (error) {
      await this.config.saveLog({ type: 'rth_error', error: String(error) });
    }
  }

  private async flushMedia(eventId: string): Promise<void> {
    try {
      await this.config.saveMedia(this.activeFrames);
      await this.config.saveLog({ type: 'media_saved', eventId, frames: this.activeFrames.length });
    } catch (error) {
      await this.config.saveLog({ type: 'media_save_error', eventId, error: String(error) });
    } finally {
      this.activeFrames = [];
    }
  }

  private setPhase(next: FlightPhase): void {
    this.phase = next;
    this.config.saveLog({ type: 'phase_change', phase: next, timestamp: new Date().toISOString() }).catch(() => {
      /* ignore logging errors */
    });
  }
}

export default FlightOrchestrator;
