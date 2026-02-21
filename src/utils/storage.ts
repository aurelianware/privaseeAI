// Local Storage Service - IndexedDB with TypeScript
import { YOLODetection } from './yolo';

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'detection' | 'motion' | 'alert' | 'manual';
  detections: YOLODetection[];
  confidence: number;
  imageBlob?: Blob;
  videoBlob?: Blob;
  metadata: {
    deviceId: string;
    location?: string;
    cameraId: string;
    duration?: number;
  };
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt?: Date;
}

export interface AppSettings {
  id: 'app_settings';
  alertThreshold: number;
  recordingEnabled: boolean;
  cloudSync: boolean;
  syncOnlyOnWifi: boolean;
  maxLocalStorageMB: number;
  retentionDays: number;
  azureConfig?: {
    accountName: string;
    containerName: string;
    sasToken?: string;
  };
  lastModified: Date;
  synced: boolean;
}

export interface SyncQueueItem {
  id: string;
  eventId: string;
  type: 'event' | 'settings' | 'blob';
  data: any;
  priority: number;
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

class LocalStorageService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'SecurityAppDB';
  private readonly DB_VERSION = 1;

  // Store names
  private readonly EVENTS_STORE = 'events';
  private readonly SETTINGS_STORE = 'settings';
  private readonly SYNC_QUEUE_STORE = 'syncQueue';
  private readonly BLOBS_STORE = 'blobs';

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        // Reopen automatically if browser closes the connection
        this.db.onclose = () => { this.db = null; this.initialize().catch(() => {}); };
        this.db.onversionchange = () => { this.db?.close(); this.db = null; };
        console.log('✅ Local storage initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Events store
        if (!db.objectStoreNames.contains(this.EVENTS_STORE)) {
          const eventsStore = db.createObjectStore(this.EVENTS_STORE, { keyPath: 'id' });
          eventsStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventsStore.createIndex('type', 'type', { unique: false });
          eventsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(this.SETTINGS_STORE)) {
          db.createObjectStore(this.SETTINGS_STORE, { keyPath: 'id' });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains(this.SYNC_QUEUE_STORE)) {
          const syncStore = db.createObjectStore(this.SYNC_QUEUE_STORE, { keyPath: 'id' });
          syncStore.createIndex('priority', 'priority', { unique: false });
          syncStore.createIndex('attempts', 'attempts', { unique: false });
        }

        // Blobs store (for large files)
        if (!db.objectStoreNames.contains(this.BLOBS_STORE)) {
          const blobsStore = db.createObjectStore(this.BLOBS_STORE, { keyPath: 'id' });
          blobsStore.createIndex('eventId', 'eventId', { unique: false });
          blobsStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  // Events CRUD operations
  async saveEvent(event: Omit<SecurityEvent, 'id' | 'synced' | 'syncAttempts'>): Promise<SecurityEvent> {
    if (!this.db) throw new Error('Database not initialized');

    const fullEvent: SecurityEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      synced: false,
      syncAttempts: 0,
    };

    const transaction = this.db.transaction([this.EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(this.EVENTS_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.add(fullEvent);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Add to sync queue if cloud sync is enabled
    const settings = await this.getSettings();
    if (settings?.cloudSync) {
      await this.addToSyncQueue({
        id: `sync_${fullEvent.id}`,
        eventId: fullEvent.id,
        type: 'event',
        data: fullEvent,
        priority: this.getEventPriority(fullEvent),
        attempts: 0,
      });
    }

    console.log('📁 Event saved locally:', fullEvent.id);
    return fullEvent;
  }

  async getEvents(options?: {
    limit?: number;
    since?: Date;
    type?: SecurityEvent['type'];
    onlyUnsynced?: boolean;
  }): Promise<SecurityEvent[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.EVENTS_STORE], 'readonly');
    const store = transaction.objectStore(this.EVENTS_STORE);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const events: SecurityEvent[] = [];
      const request = index.openCursor(null, 'prev'); // Latest first

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (cursor && (!options?.limit || events.length < options.limit)) {
          const eventData = cursor.value as SecurityEvent;
          
          // Apply filters
          if (options?.since && eventData.timestamp < options.since) {
            cursor.continue();
            return;
          }
          
          if (options?.type && eventData.type !== options.type) {
            cursor.continue();
            return;
          }
          
          if (options?.onlyUnsynced && eventData.synced) {
            cursor.continue();
            return;
          }

          events.push(eventData);
          cursor.continue();
        } else {
          resolve(events);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async markEventSynced(eventId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(this.EVENTS_STORE);

    const getRequest = store.get(eventId);
    
    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const event = getRequest.result;
        if (event) {
          event.synced = true;
          event.lastSyncAttempt = new Date();
          
          const putRequest = store.put(event);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Event not found'));
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Settings management
  async saveSettings(settings: Omit<AppSettings, 'id' | 'lastModified' | 'synced'>): Promise<AppSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const fullSettings: AppSettings = {
      ...settings,
      id: 'app_settings',
      lastModified: new Date(),
      synced: false,
    };

    const transaction = this.db.transaction([this.SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(this.SETTINGS_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(fullSettings);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Add settings to sync queue
    if (fullSettings.cloudSync) {
      await this.addToSyncQueue({
        id: 'sync_settings',
        eventId: 'app_settings',
        type: 'settings',
        data: fullSettings,
        priority: 1, // High priority
        attempts: 0,
      });
    }

    console.log('⚙️ Settings saved locally');
    return fullSettings;
  }

  async getSettings(): Promise<AppSettings | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(this.SETTINGS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get('app_settings');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Sync queue management
  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.SYNC_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(this.SYNC_QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(limit: number = 10): Promise<SyncQueueItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.SYNC_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(this.SYNC_QUEUE_STORE);
    const index = store.index('priority');

    return new Promise((resolve, reject) => {
      const items: SyncQueueItem[] = [];
      const request = index.openCursor(null, 'prev'); // High priority first

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (cursor && items.length < limit) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async removeSyncQueueItem(itemId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([this.SYNC_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(this.SYNC_QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(itemId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Storage management
  async getStorageStats(): Promise<{
    totalEvents: number;
    unsyncedEvents: number;
    storageUsed: number;
    queueLength: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const [totalEvents, unsyncedEvents, queueLength] = await Promise.all([
      this.countStore(this.EVENTS_STORE),
      this.countIndex(this.EVENTS_STORE, 'synced', false),
      this.countStore(this.SYNC_QUEUE_STORE),
    ]);

    // Estimate storage used (rough calculation)
    const storageUsed = await this.estimateStorageSize();

    return {
      totalEvents,
      unsyncedEvents,
      storageUsed,
      queueLength,
    };
  }

  async cleanupOldEvents(olderThanDays: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const transaction = this.db.transaction([this.EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(this.EVENTS_STORE);
    const index = store.index('timestamp');

    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (cursor) {
          const eventData = cursor.value as SecurityEvent;
          
          // Only delete synced events
          if (eventData.synced) {
            cursor.delete();
            deletedCount++;
          }
          
          cursor.continue();
        } else {
          console.log(`🧹 Cleaned up ${deletedCount} old events`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Helper methods
  private getEventPriority(event: SecurityEvent): number {
    // Higher number = higher priority
    switch (event.type) {
      case 'alert': return 5;
      case 'detection': return event.detections.some(d => d.className === 'person') ? 4 : 3;
      case 'motion': return 2;
      case 'manual': return 1;
      default: return 1;
    }
  }

  private async countStore(storeName: string): Promise<number> {
    if (!this.db) return 0;

    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async countIndex(storeName: string, indexName: string, value: any): Promise<number> {
    if (!this.db) return 0;

    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);

    return new Promise((resolve, reject) => {
      const request = index.count(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async estimateStorageSize(): Promise<number> {
    if (!navigator.storage?.estimate) return 0;
    
    try {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    } catch {
      return 0;
    }
  }
}

// Singleton instance
export const localStorageService = new LocalStorageService();

// Initialize on module load
localStorageService.initialize().catch(console.error);

export default localStorageService;