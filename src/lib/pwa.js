// Register service worker
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
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
    // Store the event for our own install button. We deliberately do NOT call
    // preventDefault(): modern Chrome shows no automatic install UI, and
    // cancelling the event without calling prompt() triggers a console warning.
    deferredPrompt = e;
  });

  // Clear prompt when app is installed
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
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
