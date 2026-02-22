import './index.css'

import ReactDOM from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import App from './App.tsx'
import { msalConfig } from './msal-config'
import { AuthProvider } from './contexts/AuthContext'

const msalInstance = new PublicClientApplication(msalConfig)

// MSAL v3+ requires initialize() to be awaited before rendering.
// Without this the instance isn't ready to process the auth code on redirect,
// causing an infinite login loop.
msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MsalProvider>
  )
})