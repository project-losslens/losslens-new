import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProfileProvider } from './context/AuthProfileContext'
import './styles/base.css'
import './styles/globals.css'
import App from './App.jsx'

import { registerSW } from './lib/pwa'

// Register service worker
registerSW()

// Handle PWA install prompt
import { setupInstallPrompt } from './lib/pwa'
setupInstallPrompt()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProfileProvider>
        <App />
      </AuthProfileProvider>
    </BrowserRouter>
  </StrictMode>,
)
