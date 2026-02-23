// Service Worker for Background Sync (JavaScript)
// Note: This file will be compiled/copied as sw.js

const SW_VERSION = '1.0.0';
const CACHE_NAME = `security-app-v${SW_VERSION}`;

// Cache resources
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Background sync tags
const SYNC_TAG_EVENTS = 'sync-events';

// Install event - cache static resources
self.addEventListener('install', (event: any) => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache: any) => {
        console.log('📦 Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      })
      .then(() => {
        console.log('✅ Service Worker installed');
        return (self as any).skipWaiting();
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event: any) => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames: string[]) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activated');
        return (self as any).clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event: any) => {
  // Skip non-GET requests and external resources
  if (event.request.method !== 'GET' || 
      event.request.url.includes('/api/') ||
      !event.request.url.startsWith((self as any).location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response: any) => {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then((response: any) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache: any) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background Sync event - upload pending data when online
self.addEventListener('sync', (event: any) => {
  console.log('🔄 Background sync triggered:', event.tag);
  
  if (event.tag === SYNC_TAG_EVENTS) {
    event.waitUntil(syncPendingData());
  }
});

// Message handler for communication with main app
self.addEventListener('message', (event: any) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      (self as any).skipWaiting();
      break;
      
    case 'REGISTER_SYNC':
      (self as any).registration.sync.register(SYNC_TAG_EVENTS)
        .then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
        .catch((error: any) => {
          event.ports[0]?.postMessage({ success: false, error: error.message });
        });
      break;
  }
});

// Sync pending data (simplified version)
async function syncPendingData(): Promise<void> {
  console.log('🔄 Background sync: Processing pending data...');
  
  try {
    // Notify main app that background sync is happening
    const clients = await (self as any).clients.matchAll();
    clients.forEach((client: any) => {
      client.postMessage({
        type: 'BACKGROUND_SYNC_STARTED',
        timestamp: Date.now(),
      });
    });
    
    // The actual sync logic will be handled by the main app
    // This service worker just triggers the sync process
    
    console.log('✅ Background sync completed');
    
    // Notify completion
    clients.forEach((client: any) => {
      client.postMessage({
        type: 'BACKGROUND_SYNC_COMPLETED',
        timestamp: Date.now(),
      });
    });
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// ── Web Push handlers ────────────────────────────────────────────────────────

// Receive a push message from the server and show a notification
self.addEventListener('push', (event: any) => {
  let data: { title?: string; body?: string; icon?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }

  const title = data.title ?? 'PrivaseeAI Alert';
  const options = {
    body: data.body ?? 'A security event was detected.',
    icon: data.icon ?? '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { url: data.url ?? '/' },
    requireInteraction: true,
  };

  event.waitUntil((self as any).registration.showNotification(title, options));
});

// Notification clicked — focus or open the app window
self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';

  event.waitUntil(
    (self as any).clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients: any[]) => {
        const existing = clients.find((c: any) => c.url.includes(url));
        return existing
          ? existing.focus()
          : (self as any).clients.openWindow(url);
      })
  );
});

export {};  // Make this a module