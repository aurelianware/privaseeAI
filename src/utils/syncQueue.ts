// Background Sync Queue Service
import localStorageService, { SecurityEvent, AppSettings, SyncQueueItem } from './storage';
import cloudSyncService from './cloudSync';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime?: Date;
  pendingItems: number;
  totalSynced: number;
  errors: string[];
}

export interface SyncProgress {
  total: number;
  completed: number;
  current?: string;
  percentage: number;
}

class SyncQueueService {
  private isProcessing = false;
  private syncInterval: number | null = null;
  private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  // Event handlers
  private onSyncStatusChange?: (status: SyncStatus) => void;
  private onSyncProgress?: (progress: SyncProgress) => void;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnlineStateChange(true));
    window.addEventListener('offline', () => this.handleOnlineStateChange(false));
    
    // Don't start background sync here - wait for initialize() to be called
  }

  // Initialize sync service
  async initialize(): Promise<void> {
    try {
      // Note: Don't call localStorageService.initialize() here as it's already initialized by App
      console.log('🔄 Sync queue service initialized');
      
      // Start background sync if we're online
      if (navigator.onLine) {
        this.startBackgroundSync();
      }
      
      // Attempt initial sync if configured
      const settings = await localStorageService.getSettings();
      if (settings?.cloudSync && settings.azureConfig) {
        cloudSyncService.configure({
          accountName: settings.azureConfig.accountName,
          containerName: settings.azureConfig.containerName,
          sasToken: settings.azureConfig.sasToken || '',
          authMethod: 'sas'
        });
        
        // Start sync process
        this.processSyncQueue();
      }
    } catch (error) {
      console.error('Failed to initialize sync service:', error);
    }
  }

  // Configure cloud sync
  async configureCloudSync(config: {
    accountName: string;
    containerName: string;
    sasToken: string;
  }): Promise<boolean> {
    try {
      // Configure with SAS token authentication
      cloudSyncService.configure({
        accountName: config.accountName,
        containerName: config.containerName,
        sasToken: config.sasToken,
        authMethod: 'sas'
      });
      
      // Test connection
      const isConnected = await cloudSyncService.testConnection();
      if (isConnected) {
        console.log('☁️ Cloud sync configured successfully');
        
        // Save config to settings
        const currentSettings = await localStorageService.getSettings();
        await localStorageService.saveSettings({
          ...currentSettings,
          cloudSync: true,
          azureConfig: config,
        } as any);
        
        // Start syncing
        this.startBackgroundSync();
        return true;
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      console.error('Failed to configure cloud sync:', error);
      return false;
    }
  }

  // Manual sync trigger
  async syncNow(): Promise<SyncStatus> {
    console.log('🔄 Manual sync triggered');
    return this.processSyncQueue();
  }

  // Process the sync queue
  async processSyncQueue(): Promise<SyncStatus> {
    if (this.isProcessing) {
      console.log('Sync already in progress');
      return this.getSyncStatus();
    }

    if (!navigator.onLine) {
      console.log('Offline - skipping sync');
      return this.getSyncStatus();
    }

    if (!cloudSyncService.isConfigured()) {
      console.log('Cloud not configured - skipping sync');
      return this.getSyncStatus();
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let totalSynced = 0;
    const errors: string[] = [];

    try {
      // Get pending sync items
      const syncItems = await localStorageService.getSyncQueue(50); // Process in batches
      
      if (syncItems.length === 0) {
        console.log('✅ No items to sync');
        return this.getSyncStatus();
      }

      console.log(`🔄 Processing ${syncItems.length} sync items`);
      
      // Report progress
      this.onSyncProgress?.({
        total: syncItems.length,
        completed: 0,
        percentage: 0,
      });

      // Process each item
      for (let i = 0; i < syncItems.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const item = syncItems[i];
        
        try {
          // Update progress
          this.onSyncProgress?.({
            total: syncItems.length,
            completed: i,
            current: `Syncing ${item.type}: ${item.eventId}`,
            percentage: Math.round((i / syncItems.length) * 100),
          });

          const success = await this.processSyncItem(item);
          
          if (success) {
            // Remove from queue and mark as synced
            await localStorageService.removeSyncQueueItem(item.id);
            
            if (item.type === 'event') {
              await localStorageService.markEventSynced(item.eventId);
            }
            
            totalSynced++;
            console.log(`✅ Synced ${item.type}: ${item.eventId}`);
          } else {
            // Increment retry count
            item.attempts++;
            item.lastAttempt = new Date();
            
            if (item.attempts >= this.MAX_RETRIES) {
              // Remove from queue after max retries
              await localStorageService.removeSyncQueueItem(item.id);
              errors.push(`Failed to sync ${item.type}: ${item.eventId} after ${this.MAX_RETRIES} attempts`);
              console.error(`❌ Giving up on ${item.type}: ${item.eventId}`);
            } else {
              // Update with new attempt count
              await localStorageService.addToSyncQueue(item);
              console.warn(`⚠️ Retry ${item.attempts}/${this.MAX_RETRIES} for ${item.type}: ${item.eventId}`);
            }
          }
          
          // Add delay between items to avoid rate limiting
          if (i < syncItems.length - 1) {
            await this.delay(100);
          }
          
        } catch (error) {
          const errorMsg = `Sync error for ${item.type}: ${item.eventId} - ${error}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Final progress update
      this.onSyncProgress?.({
        total: syncItems.length,
        completed: syncItems.length,
        percentage: 100,
      });

      const syncTime = Date.now() - startTime;
      console.log(`🔄 Sync completed: ${totalSynced}/${syncItems.length} items in ${syncTime}ms`);

    } catch (error) {
      const errorMsg = `Sync process failed: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    } finally {
      this.isProcessing = false;
    }

    const status = this.getSyncStatus();
    this.onSyncStatusChange?.(status);
    return status;
  }

  // Process individual sync item
  private async processSyncItem(item: SyncQueueItem): Promise<boolean> {
    try {
      switch (item.type) {
        case 'event':
          const eventResult = await cloudSyncService.uploadEvent(item.data as SecurityEvent);
          return eventResult.success;

        case 'settings':
          const settingsResult = await cloudSyncService.uploadSettings(item.data as AppSettings);
          return settingsResult.success;

        default:
          console.warn(`Unknown sync item type: ${item.type}`);
          return false;
      }
    } catch (error) {
      console.error(`Failed to process sync item ${item.id}:`, error);
      return false;
    }
  }

  // Download and merge data from cloud
  async downloadFromCloud(): Promise<{
    events: number;
    settingsUpdated: boolean;
    conflicts: number;
  }> {
    if (!cloudSyncService.isConfigured()) {
      throw new Error('Cloud sync not configured');
    }

    console.log('☁️ Downloading data from cloud...');
    
    let eventsCount = 0;
    let settingsUpdated = false;
    let conflicts = 0;

    try {
      // Download settings first
      const cloudSettings = await cloudSyncService.downloadSettings();
      if (cloudSettings) {
        const localSettings = await localStorageService.getSettings();
        
        if (!localSettings || cloudSettings.lastModified > localSettings.lastModified) {
          await localStorageService.saveSettings(cloudSettings);
          settingsUpdated = true;
          console.log('✅ Settings updated from cloud');
        }
      }

      // Download events newer than our last sync
      const localEvents = await localStorageService.getEvents({ limit: 1 });
      const lastLocalEvent = localEvents[0]?.timestamp;
      
      const cloudEvents = await cloudSyncService.downloadEvents(lastLocalEvent);
      
      for (const event of cloudEvents) {
        try {
          // Check if we already have this event
          const existingEvents = await localStorageService.getEvents({ 
            limit: 1,
            since: new Date(event.timestamp.getTime() - 1000), // 1 second tolerance
          });
          
          const isDuplicate = existingEvents.some(e => 
            Math.abs(e.timestamp.getTime() - event.timestamp.getTime()) < 1000 &&
            e.detections.length === event.detections.length
          );
          
          if (!isDuplicate) {
            const savedEvent = await localStorageService.saveEvent({
              ...event,
            });
            // Mark as synced after saving
            await localStorageService.markEventSynced(savedEvent.id);
            eventsCount++;
          } else {
            conflicts++;
          }
        } catch (error) {
          console.warn(`Failed to save cloud event:`, error);
        }
      }

      console.log(`☁️ Downloaded ${eventsCount} new events, ${conflicts} conflicts resolved`);
      
      return { events: eventsCount, settingsUpdated, conflicts };
      
    } catch (error) {
      console.error('Failed to download from cloud:', error);
      throw error;
    }
  }

  // Start/stop background sync
  startBackgroundSync(): void {
    if (this.syncInterval) return; // Already running

    console.log('🔄 Starting background sync');
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine && cloudSyncService.isConfigured()) {
        this.processSyncQueue();
      }
    }, this.SYNC_INTERVAL_MS);
  }

  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Background sync stopped');
    }
  }

  // Get current sync status
  getSyncStatus(): SyncStatus {
    return {
      isOnline: navigator.onLine,
      isSyncing: this.isProcessing,
      lastSyncTime: new Date(), // TODO: Track actual last sync time
      pendingItems: 0, // TODO: Get from storage
      totalSynced: 0, // TODO: Track total synced items
      errors: [], // TODO: Track recent errors
    };
  }

  // Event handlers
  onStatusChange(handler: (status: SyncStatus) => void): void {
    this.onSyncStatusChange = handler;
  }

  onProgress(handler: (progress: SyncProgress) => void): void {
    this.onSyncProgress = handler;
  }

  // Handle online/offline state changes
  private handleOnlineStateChange(isOnline: boolean): void {
    console.log(`📶 Network status: ${isOnline ? 'online' : 'offline'}`);
    
    if (isOnline) {
      this.startBackgroundSync();
      // Trigger immediate sync when coming back online
      setTimeout(() => this.processSyncQueue(), 1000);
    } else {
      this.stopBackgroundSync();
    }
    
    // Notify status change
    this.onSyncStatusChange?.(this.getSyncStatus());
  }

  // Utility methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup old data (both local and cloud)
  async cleanup(retentionDays: number): Promise<{
    localDeleted: number;
    cloudDeleted: number;
  }> {
    console.log(`🧹 Starting cleanup (older than ${retentionDays} days)`);
    
    const [localDeleted, cloudDeleted] = await Promise.all([
      localStorageService.cleanupOldEvents(retentionDays),
      cloudSyncService.isConfigured() 
        ? cloudSyncService.cleanupCloudEvents(retentionDays)
        : Promise.resolve(0),
    ]);

    console.log(`🧹 Cleanup completed: ${localDeleted} local, ${cloudDeleted} cloud`);
    
    return { localDeleted, cloudDeleted };
  }

  // Get storage statistics
  async getStorageStats(): Promise<{
    local: Awaited<ReturnType<typeof localStorageService.getStorageStats>>;
    cloud?: Awaited<ReturnType<typeof cloudSyncService.getStorageInfo>>;
  }> {
    const local = await localStorageService.getStorageStats();
    
    let cloud;
    if (cloudSyncService.isConfigured()) {
      try {
        cloud = await cloudSyncService.getStorageInfo();
      } catch (error) {
        console.warn('Failed to get cloud storage stats:', error);
      }
    }

    return { local, cloud };
  }
}

// Singleton instance
export const syncQueueService = new SyncQueueService();

// Don't auto-initialize - let the App component control initialization timing
export default syncQueueService;