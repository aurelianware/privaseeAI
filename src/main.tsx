import './index.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import App from './App.tsx'
import { msalConfig } from './msal-config'

// Unregister any stale service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

const msalInstance = new PublicClientApplication(msalConfig)

// MSAL v3+ requires initialize() to be awaited before rendering.
// Without this the instance isn't ready to process the auth code on redirect,
// causing an infinite login loop.
msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  )
})