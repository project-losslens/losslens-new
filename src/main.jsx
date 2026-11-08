import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProfileProvider } from './context/AuthProfileContext'
import './styles/tokens.css'
import './index.css'
import './styles/globals.css'
import App from './App.jsx'
import SiteGate from './components/SiteGate.jsx'

import { registerSW } from './lib/pwa'

// Register service worker
registerSW()

// Handle PWA install prompt
import { setupInstallPrompt } from './lib/pwa'
setupInstallPrompt()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SiteGate>
      <BrowserRouter>
        <AuthProfileProvider>
          <App />
        </AuthProfileProvider>
      </BrowserRouter>
    </SiteGate>
  </StrictMode>,
)
