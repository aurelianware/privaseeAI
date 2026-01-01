// Flight Operations Logger
import { DroneEvent, DroneError, FlightLogEntry, DroneTelemetry } from '../types';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  droneId?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  logLevel: LogLevel;
  maxLogSizeMB: number;
  logRetentionDays: number;
  logDirectory: string;
}

/**
 * FlightLogger - Logging system for drone operations
 */
export class FlightLogger {
  private static instance: FlightLogger;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flightLogs: Map<string, FlightLogEntry> = new Map();
  private readonly MAX_BUFFER_SIZE = 1000;

  private constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      enableConsoleLogging: true,
      enableFileLogging: true,
      logLevel: LogLevel.INFO,
      maxLogSizeMB: 100,
      logRetentionDays: 30,
      logDirectory: process.env.DRONE_LOG_DIR || './logs/drone',
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<LoggerConfig>): FlightLogger {
    if (!FlightLogger.instance) {
      FlightLogger.instance = new FlightLogger(config);
    }
    return FlightLogger.instance;
  }

  /**
   * Log debug message
   */
  public debug(category: string, message: string, data?: any, droneId?: string): void {
    this.log(LogLevel.DEBUG, category, message, data, droneId);
  }

  /**
   * Log info message
   */
  public info(category: string, message: string, data?: any, droneId?: string): void {
    this.log(LogLevel.INFO, category, message, data, droneId);
  }

  /**
   * Log warning message
   */
  public warn(category: string, message: string, data?: any, droneId?: string): void {
    this.log(LogLevel.WARN, category, message, data, droneId);
  }

  /**
   * Log error message
   */
  public error(category: string, message: string, data?: any, droneId?: string): void {
    this.log(LogLevel.ERROR, category, message, data, droneId);
  }

  /**
   * Log critical message
   */
  public critical(category: string, message: string, data?: any, droneId?: string): void {
    this.log(LogLevel.CRITICAL, category, message, data, droneId);
  }

  /**
   * Log drone event
   */
  public logEvent(event: DroneEvent): void {
    const level = this.eventSeverityToLogLevel(event.severity);
    this.log(level, 'DRONE_EVENT', `${event.type}`, event.data, event.droneId);
  }

  /**
   * Log drone error
   */
  public logError(error: DroneError, droneId?: string): void {
    const level = this.eventSeverityToLogLevel(error.severity);
    this.log(level, 'DRONE_ERROR', `[${error.code}] ${error.message}`, error.details, droneId);
  }

  /**
   * Start flight log
   */
  public startFlightLog(flightLog: FlightLogEntry): void {
    this.flightLogs.set(flightLog.id, flightLog);
    this.info('FLIGHT', `Flight started: ${flightLog.id}`, {
      droneId: flightLog.droneId,
      takeoffLocation: flightLog.takeoffLocation,
    }, flightLog.droneId);
  }

  /**
   * Update flight log
   */
  public updateFlightLog(
    flightId: string,
    updates: Partial<FlightLogEntry>
  ): void {
    const log = this.flightLogs.get(flightId);
    if (log) {
      Object.assign(log, updates);
      this.debug('FLIGHT', `Flight log updated: ${flightId}`, updates);
    }
  }

  /**
   * End flight log
   */
  public endFlightLog(flightId: string, endData: {
    endTime: Date;
    landingLocation: { latitude: number; longitude: number; altitude: number };
  }): FlightLogEntry | undefined {
    const log = this.flightLogs.get(flightId);
    if (log) {
      log.endTime = endData.endTime;
      log.landingLocation = endData.landingLocation;
      log.duration = (endData.endTime.getTime() - log.startTime.getTime()) / 1000;
      
      this.info('FLIGHT', `Flight ended: ${flightId}`, {
        duration: log.duration,
        landingLocation: endData.landingLocation,
      }, log.droneId);

      // Archive the log
      this.archiveFlightLog(log);
      this.flightLogs.delete(flightId);
      
      return log;
    }
    return undefined;
  }

  /**
   * Get flight log
   */
  public getFlightLog(flightId: string): FlightLogEntry | undefined {
    return this.flightLogs.get(flightId);
  }

  /**
   * Get all active flight logs
   */
  public getActiveFlightLogs(): FlightLogEntry[] {
    return Array.from(this.flightLogs.values());
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    droneId?: string
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      droneId,
    };

    // Add to buffer
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer.shift();
    }

    // Console logging
    if (this.config.enableConsoleLogging) {
      this.logToConsole(entry);
    }

    // File logging would be implemented here
    if (this.config.enableFileLogging) {
      this.logToFile(entry);
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Log to console
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    const droneInfo = entry.droneId ? ` [Drone: ${entry.droneId}]` : '';
    const message = `${prefix}${droneInfo} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.data || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(message, entry.data || '');
        break;
    }
  }

  /**
   * Log to file (placeholder for actual implementation)
   */
  private logToFile(entry: LogEntry): void {
    // In a real implementation, this would write to a file
    // For now, we'll just store in memory
    // Future enhancement: use fs.appendFile or a logging library like winston
  }

  /**
   * Archive flight log (placeholder for actual implementation)
   */
  private archiveFlightLog(log: FlightLogEntry): void {
    // In a real implementation, this would save to database or file
    // For now, we'll just log it
    this.info('FLIGHT_ARCHIVE', `Archived flight log: ${log.id}`, {
      duration: log.duration,
      totalDistance: log.totalDistance,
      eventCount: log.events.length,
      errorCount: log.errors.length,
    });
  }

  /**
   * Convert event severity to log level
   */
  private eventSeverityToLogLevel(severity: 'info' | 'warning' | 'error' | 'critical'): LogLevel {
    switch (severity) {
      case 'info':
        return LogLevel.INFO;
      case 'warning':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      case 'critical':
        return LogLevel.CRITICAL;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Get recent logs
   */
  public getRecentLogs(count: number = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * Clear log buffer
   */
  public clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * Get logger configuration
   */
  public getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Update logger configuration
   */
  public updateConfig(updates: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Helper function to get logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): FlightLogger {
  return FlightLogger.getInstance(config);
}

/**
 * Helper function for quick logging
 */
export const logger = {
  debug: (category: string, message: string, data?: any, droneId?: string) =>
    FlightLogger.getInstance().debug(category, message, data, droneId),
  info: (category: string, message: string, data?: any, droneId?: string) =>
    FlightLogger.getInstance().info(category, message, data, droneId),
  warn: (category: string, message: string, data?: any, droneId?: string) =>
    FlightLogger.getInstance().warn(category, message, data, droneId),
  error: (category: string, message: string, data?: any, droneId?: string) =>
    FlightLogger.getInstance().error(category, message, data, droneId),
  critical: (category: string, message: string, data?: any, droneId?: string) =>
    FlightLogger.getInstance().critical(category, message, data, droneId),
};
