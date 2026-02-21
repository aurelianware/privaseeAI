/// <reference types="vite/client" />
import { Configuration, LogLevel } from '@azure/msal-browser';

/**
 * Microsoft Entra ID — Multi-tenant OIDC App Registration config.
 *
 * App registration settings (portal.azure.com):
 *   Supported account types : "Accounts in any organizational directory
 *                              (Any Microsoft Entra ID tenant) and personal Microsoft accounts"
 *   Redirect URI platform   : Single-page application (SPA)
 *   Redirect URI            : http://localhost:5173  (add production URL too)
 *
 * Required environment variable (.env.local):
 *   VITE_ENTRA_CLIENT_ID   – Application (client) ID from the app registration
 *
 * Optional:
 *   VITE_ENTRA_REDIRECT_URI – defaults to window.location.origin
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID ?? '',
    // 'common' allows any Entra ID tenant + personal Microsoft accounts.
    // Use 'organizations' to restrict to work/school accounts only.
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:   console.error('[MSAL]', message); break;
          case LogLevel.Warning: console.warn('[MSAL]', message);  break;
          case LogLevel.Info:    console.info('[MSAL]', message);  break;
          case LogLevel.Verbose: console.debug('[MSAL]', message); break;
        }
      },
    },
  },
};

/** Scopes requested during login */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};
