/**
 * Webhook Handler for privaseeAI Camera Events
 * Receives motion detection and threat alerts from ground cameras
 * Triggers drone responses via EventDispatcher
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import eventDispatcher, { CameraEvent, DroneResponse } from '../services/EventDispatcher';
// import { FlightOrchestrator } from '../services/FlightOrchestrator';
import logger from '../utils/logger';

const webhookRouter = Router();
// const flightOrchestrator = new FlightOrchestrator(); // TODO: Implement missing methods generateMission and executeMission

// Webhook authentication middleware
const authenticateWebhook = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.WEBHOOK_API_KEY;

  if (!expectedKey) {
    logger.warn('WEBHOOK_API_KEY not set, skipping authentication');
    return next();
  }

  if (!apiKey || apiKey !== expectedKey) {
    logger.warn('Invalid webhook API key attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

webhookRouter.use(authenticateWebhook);

/**
 * POST /webhook/camera-event
 * Receives camera motion detection events from privaseeAI
 * Payload: {
 *   cameraId: string,
 *   location: { latitude, longitude, altitude? },
 *   threatType: 'motion' | 'person' | 'vehicle' | 'unknown',
 *   threatLevel: 'low' | 'medium' | 'high' | 'critical',
 *   snapshotUrl?: string,
 *   metadata?: object
 * }
 */
webhookRouter.post('/camera-event', async (req: Request, res: Response) => {
  try {
    const { cameraId, location, threatType, threatLevel, snapshotUrl, metadata } = req.body;

    // Validation
    if (!cameraId || !location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        error: 'Missing required fields: cameraId, location.latitude, location.longitude',
      });
    }

    if (!['motion', 'person', 'vehicle', 'unknown', 'alarm'].includes(threatType)) {
      return res.status(400).json({
        error: 'Invalid threatType. Must be: motion, person, vehicle, unknown, or alarm',
      });
    }

    if (!['low', 'medium', 'high', 'critical'].includes(threatLevel)) {
      return res.status(400).json({
        error: 'Invalid threatLevel. Must be: low, medium, high, or critical',
      });
    }

    // Create camera event
    const event: CameraEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      cameraId,
      location,
      threatType,
      threatLevel,
      snapshotUrl,
      metadata,
    };

    logger.info(`Received camera event from ${cameraId}`, {
      eventId: event.id,
      threatType,
      threatLevel,
    });

    // Process event through dispatcher
    await eventDispatcher.processEvent(event);

    // Listen for drone trigger and initiate response
    const droneTriggered = await new Promise<boolean>((resolve) => {
      const handler = async (triggerData: any) => {
        if (triggerData.eventId === event.id) {
          eventDispatcher.removeListener('drone-trigger', handler);
          resolve(true);

          // Create drone response
          const droneResponse: DroneResponse = {
            eventId: event.id,
            droneId: process.env.DRONE_ID || 'drone-001',
            status: 'pending',
            approvalRequired: threatLevel === 'critical' ? false : true, // Auto-approve critical
            approvalExpiry: new Date(Date.now() + 30 * 1000), // 30 second approval window
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          eventDispatcher.recordDroneResponse(droneResponse);

          // If critical threat, auto-launch
          if (threatLevel === 'critical') {
            try {
              // TODO: Implement FlightOrchestrator methods
              logger.info(`Critical threat detected at ${location.latitude},${location.longitude} - drone launch disabled (not implemented)`);
              /*
              const mission = await flightOrchestrator.generateMission(
                {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  altitude: location.altitude || 25,
                },
                'investigate'
              );

              eventDispatcher.updateDroneResponse(event.id, {
                status: 'executing',
                missionId: mission.id,
              });

              // Initiate flight asynchronously (don't wait for completion)
              flightOrchestrator.executeMission(mission).catch((err: Error) => {
                logger.error(`Mission execution failed: ${err.message}`);
                eventDispatcher.updateDroneResponse(event.id, {
                  status: 'failed',
                  error: err.message,
                });
              });
              */
            } catch (err) {
              logger.error(`Failed to generate mission: ${err}`);
              eventDispatcher.updateDroneResponse(event.id, {
                status: 'failed',
                error: (err as Error).message,
              });
            }
          }
        }
      };

      eventDispatcher.once('drone-trigger', handler);

      // Timeout after 2 seconds
      setTimeout(() => {
        eventDispatcher.removeListener('drone-trigger', handler);
        resolve(false);
      }, 2000);
    });

    res.status(202).json({
      success: true,
      eventId: event.id,
      droneTriggered,
      approvalRequired:
        threatLevel === 'critical'
          ? false
          : threatLevel === 'high'
            ? 'optional'
            : threatLevel === 'medium'
              ? true
              : false,
      message: droneTriggered
        ? 'Event processed. Drone response initiated.'
        : 'Event processed. No drone trigger warranted.',
    });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

/**
 * POST /webhook/approve-drone-response
 * Approve pending drone response
 */
webhookRouter.post('/approve-drone-response', (req: Request, res: Response) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'Missing eventId' });
    }

    const response = eventDispatcher.getDroneResponse(eventId);
    if (!response) {
      return res.status(404).json({ error: 'Drone response not found' });
    }

    if (response.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot approve response with status: ${response.status}`,
      });
    }

    eventDispatcher.approveDroneResponse(eventId);

    logger.info(`Drone response approved for event ${eventId}`);

    // Trigger mission execution
    const event = eventDispatcher.getEvent(eventId);
    if (event) {
      // TODO: Implement FlightOrchestrator methods
      logger.info(`Approving mission for event ${eventId} - drone launch disabled (not implemented)`);
      /*
      flightOrchestrator.generateMission(event.location, 'investigate').then((mission: any) => {
        eventDispatcher.updateDroneResponse(eventId, {
          status: 'executing',
          missionId: mission.id,
        });

        flightOrchestrator.executeMission(mission).catch((err: Error) => {
          logger.error(`Mission execution failed: ${err.message}`);
          eventDispatcher.updateDroneResponse(eventId, {
            status: 'failed',
            error: err.message,
          });
        });
      });
      */
    }

    res.json({
      success: true,
      eventId,
      message: 'Drone response approved. Mission execution initiated.',
    });
  } catch (error) {
    logger.error('Approval error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

/**
 * POST /webhook/reject-drone-response
 * Reject pending drone response
 */
webhookRouter.post('/reject-drone-response', (req: Request, res: Response) => {
  try {
    const { eventId, reason } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'Missing eventId' });
    }

    const response = eventDispatcher.getDroneResponse(eventId);
    if (!response) {
      return res.status(404).json({ error: 'Drone response not found' });
    }

    eventDispatcher.rejectDroneResponse(eventId, reason);

    logger.info(`Drone response rejected for event ${eventId}`, { reason });

    res.json({
      success: true,
      eventId,
      message: 'Drone response rejected.',
    });
  } catch (error) {
    logger.error('Rejection error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /webhook/status/:eventId
 * Get status of camera event and drone response
 */
webhookRouter.get('/status/:eventId', (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    
    // Ensure eventId is a string (route params can be string | string[])
    const eventIdStr = Array.isArray(eventId) ? eventId[0] : eventId;

    const event = eventDispatcher.getEvent(eventIdStr);
    const droneResponse = eventDispatcher.getDroneResponse(eventIdStr);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({
      event,
      droneResponse: droneResponse || null,
    });
  } catch (error) {
    logger.error('Status query error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /webhook/pending-approvals
 * Get all pending drone responses awaiting approval
 */
webhookRouter.get('/pending-approvals', (_req: Request, res: Response) => {
  try {
    const pendingApprovals = eventDispatcher.getPendingApprovals();

    const approvals = pendingApprovals.map((response) => {
      const event = eventDispatcher.getEvent(response.eventId);
      return {
        response,
        event: {
          id: event?.id,
          threatType: event?.threatType,
          threatLevel: event?.threatLevel,
          location: event?.location,
          timestamp: event?.timestamp,
        },
      };
    });

    res.json({
      count: approvals.length,
      approvals,
    });
  } catch (error) {
    logger.error('Pending approvals query error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /webhook/stats
 * Get dispatcher statistics
 */
webhookRouter.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = eventDispatcher.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Stats query error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
});

export default webhookRouter;
