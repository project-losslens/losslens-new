import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProfileProvider } from './context/AuthProfileContext'
import { GlobalLoaderHost } from './components/Brand'
import { ToastProvider } from './components/ToastProvider'
import './styles/base.css'
import './styles/globals.css'
import './styles/utilities.css'
import App from './App.jsx'

import { registerSW, setupInstallPrompt } from './lib/pwa'

// Register service worker
registerSW()

// Handle PWA install prompt
setupInstallPrompt()

// Apply the low-data preference before first paint.
if (localStorage.getItem('losslens_low_data') === 'true') {
  document.documentElement.dataset.lowData = 'true'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProfileProvider>
        <ToastProvider>
          <GlobalLoaderHost />
          <App />
        </ToastProvider>
      </AuthProfileProvider>
    </BrowserRouter>
  </StrictMode>,
)
requestAnimationFrame(() => document.getElementById('boot-loader')?.remove())
