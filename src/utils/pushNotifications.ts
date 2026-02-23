// Browser-side Web Push helpers
// Requires VITE_VAPID_PUBLIC_KEY in .env.local (same value as VAPID_PUBLIC_KEY)

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/** True if browser supports Web Push */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Check whether this browser already has an active push subscription */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

/**
 * Subscribe this browser to Web Push and register the subscription with
 * the server. Requires notification permission to be granted first.
 * @param idToken  MSAL idToken for the Bearer Authorization header
 */
export async function subscribeToPush(idToken: string): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('Web Push not supported in this browser');
    return false;
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!publicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is not set');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as Uint8Array<ArrayBuffer>,
    });

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        endpoint,
        keys,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) {
      console.error('Failed to register push subscription on server:', await res.text());
      return false;
    }

    console.log('✅ Push subscription registered');
    return true;
  } catch (err) {
    console.error('subscribeToPush error:', err);
    return false;
  }
}

/**
 * Unsubscribe this browser from Web Push and remove from the server.
 * @param idToken  MSAL idToken for the Bearer Authorization header
 */
export async function unsubscribeFromPush(idToken: string): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ endpoint }),
    });

    console.log('🔕 Push subscription removed');
  } catch (err) {
    console.error('unsubscribeFromPush error:', err);
  }
}
