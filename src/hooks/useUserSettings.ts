/**
 * useUserSettings
 * 
 * Loads and persists user settings server-side (PostgreSQL via /api/user/settings),
 * keyed by the Microsoft Entra Object ID so they survive logout / new devices.
 * 
 * Falls back to IndexedDB-only mode if the API is unavailable.
 */
import { useCallback } from 'react';
import { useMsal, useAccount } from '@azure/msal-react';

export interface RemoteUserSettings {
  azureAccountName?: string;
  azureContainerName?: string;
  sasToken?: string;
  managedContainer?: boolean;
  confidenceThreshold?: number;
  humanDetection?: boolean;
  motionDetection?: boolean;
  notifications?: boolean;
  cloudSync?: boolean;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  subscriptionCurrentPeriodEnd?: string;
}

function getIdToken(accounts: ReturnType<typeof useMsal>['accounts']): string | null {
  const account = accounts[0];
  if (!account) return null;
  return (account as any).idToken ?? null;
}

export function useUserSettings() {
  const { accounts } = useMsal();

  const getAuthHeader = useCallback((): Record<string, string> => {
    const token = getIdToken(accounts);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [accounts]);

  /** Load settings from the server. Returns null if not found or API unavailable. */
  const loadFromServer = useCallback(async (): Promise<RemoteUserSettings | null> => {
    const headers = getAuthHeader();
    if (!headers.Authorization) return null;
    try {
      const res = await fetch('/api/user/settings', { headers });
      if (res.status === 401 || res.status === 503) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [getAuthHeader]);

  /** Persist settings to the server (partial update — only send changed fields). */
  const saveToServer = useCallback(async (settings: Partial<RemoteUserSettings>): Promise<boolean> => {
    const headers = getAuthHeader();
    if (!headers.Authorization) return false;
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [getAuthHeader]);

  const account = useAccount(accounts[0] ?? null);

  return { loadFromServer, saveToServer, isAuthenticated: !!account };
}
