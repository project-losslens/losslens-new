// LossLens service worker.
// - Precaches only the built asset manifest (injected at build time below).
// - Never caches /api/, Supabase, or auth endpoints.
// - Offline fallback page lists crisis helplines (works with no network).

const CACHE_VERSION = 'losslens-v11'
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

const OFFLINE_SERVICES = /* VERIFIED_SUPPORT_SERVICES */ []

const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LossLens — Offline</title><style>body{background:#7136CC;color:#F3EAF8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center}h1{color:#EAD9F3}a{color:#EAD9F3}</style></head><body><div><h1>You are offline</h1><p>LossLens needs a connection for most features. If you or someone else is in crisis, these numbers work without internet being required to remember them:</p><p>${OFFLINE_SERVICES.map(service => `<strong>${service.name}:</strong> <a href="tel:${service.tel}">${service.phone}</a><br>${service.hours}<br>`).join('')}</p><p>Published hours do not guarantee an immediate response.</p><p><strong>Emergency:</strong> 999 / 112</p><p><a href="/">Try again</a></p></div></body></html>`

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
    url.pathname === '/__gate' ||
    url.pathname === '/__gate/lock' ||
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

  if (url.origin !== self.location.origin) return
  const immutableAsset = /^\/assets\/[^/]+-[\w-]{8}\.(?:js|css|woff2)$/.test(url.pathname)
    || url.pathname === '/oloo-portrait-128.jpg'
  if (immutableAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE).catch(() => null)
      const cached = await cache?.match(request).catch(() => null)
      if (cached) return cached
      const response = await fetch(request)
      const cacheControl = response.headers.get('Cache-Control') || ''
      if (response.status === 200 && !cacheControl.includes('no-store')) {
        await cache?.put(request, response.clone()).catch(() => {})
      }
      return response
    })())
    return
  }

  // Keep HTML and other unversioned resources network-first.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const cacheControl = response.headers.get('Cache-Control') || ''
        if (response && response.status === 200 && response.type !== 'opaque' && !cacheControl.includes('no-store')) {
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
