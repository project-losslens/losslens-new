// LossLens service worker.
// - Precaches only the built asset manifest (injected at build time below).
// - Never caches /api/, Supabase, or auth endpoints.
// - Offline fallback page lists crisis helplines (works with no network).

const CACHE_VERSION = 'losslens-v2'
const CACHE_NAME = `${CACHE_VERSION}-precache`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// BUILD_MANIFEST is replaced by vite-plugin or left empty; fall back to
// caching only the shell documents which always exist.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
]

const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LossLens — Offline</title><style>body{background:#0B1220;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center}h1{color:#2DD4BF}a{color:#7DBDEE}</style></head><body><div><h1>You are offline</h1><p>LossLens needs a connection for most features. If you or someone else is in crisis, these numbers work without internet being required to remember them:</p><p><strong>Befrienders Kenya:</strong> +254 722 178 177<br><strong>NACADA:</strong> 1192<br><strong>Emergency:</strong> 999 / 112</p><p><a href="/">Try again</a></p></div></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  )
})

function shouldBypass(url) {
  return (
    !url.protocol.startsWith('http') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('groq.com') ||
    url.pathname.includes('/auth/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (shouldBypass(url)) return

  // Network-first for everything; cache only same-origin GET successes.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {})
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        return new Response('Offline', { status: 503 })
      })
  )
})
