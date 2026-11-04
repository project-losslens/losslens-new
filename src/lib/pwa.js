// Register service worker
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New version available');
              }
            });
          });
        })
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    });
  }
}

// Check if app is installed
export function isPWAInstalled() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone
    || document.referrer.includes('android-app://');
}

// Show install prompt
let deferredPrompt = null;
export function setupInstallPrompt() {
  if (typeof window === 'undefined') return;
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  
  // Clear prompt when app is installed
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    console.log('PWA was installed');
  });
}

export async function showInstallPrompt() {
  if (!deferredPrompt) return false;
  
  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch (error) {
    console.error('Install prompt error:', error);
    deferredPrompt = null;
    return false;
  }
}

// Get install button visibility
export function canShowInstall() {
  return !!deferredPrompt && !isPWAInstalled();
}

// Unregister service worker (for debugging)
export async function unregisterSW() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const result = await registration.unregister();
    console.log('SW unregistered:', result);
    return result;
  }
  return false;
}
