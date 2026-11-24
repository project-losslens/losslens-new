import { next } from '@vercel/functions'
import { primaryHelpline } from './src/config/helplines.js'
import {
  GATE_COOKIE_NAME,
  GATE_COOKIE_TTL_MS,
  buildCookieHeader,
  buildGateCookieValue,
  clearGateCookieHeader,
  getGateCookieFromRequest,
  isGateEnabled,
  isSafeSameOriginRelativePath,
  matchesGatePassword,
  verifyGateCookieValue,
} from './lib/gate.js'

const ALLOWLIST = [
  '/favicon.svg',
  '/favicon.ico',
  '/manifest.json',
  '/service-worker.js',
  '/robots.txt',
  '/losslens-icon-*.png',
  // Add /family-join if invitees must reach it while the site is private.
]

const GATE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>LossLens — Access required</title><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#FAF7F2;color:#292329}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 85% 0,rgba(101,59,96,.10),transparent 40%),#FAF7F2}
main{width:min(100%,440px);padding:32px 24px;border:1px solid rgba(41,35,41,.16);border-radius:20px;background:#FFFFFF;box-shadow:0 24px 64px rgba(41,35,41,.12)}
.brand{margin:0 0 24px;font-size:1.55rem;font-weight:750;letter-spacing:-.04em}.brand span{color:#653B60}
.chip{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(183,121,50,.12);color:#7B4A17;font-size:.75rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
h1{margin:18px 0 10px;font-size:clamp(2rem,7vw,2.5rem);line-height:1.1;letter-spacing:-.03em}
.intro{margin:0 0 24px;color:#4B444B;line-height:1.6;font-size:1rem}
label{display:block;margin-bottom:8px;color:#4B444B;font-size:.9rem;font-weight:600}
input{width:100%;min-height:48px;padding:12px 14px;border:1px solid rgba(41,35,41,.25);border-radius:10px;background:#FFFFFF;color:#292329;font-size:1rem}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #653B60;outline-offset:3px}
button{width:100%;min-height:48px;margin-top:14px;border:0;border-radius:999px;background:#653B60;color:#FFFFFF;font-size:1rem;font-weight:700;cursor:pointer}
.error{min-height:1.4em;margin:12px 0 0;color:#A12E3E;font-size:.9rem}
.access{display:flex;align-items:center;justify-content:center;gap:12px;margin:22px 0 0;color:#4B444B;font-size:.9rem}
.icon-link{display:grid;place-items:center;width:42px;height:42px;border:1px solid rgba(41,35,41,.2);border-radius:50%;color:#653B60}
.icon-link svg{width:19px;height:19px;fill:currentColor}
.crisis{margin:20px 0 0;padding-top:18px;border-top:1px solid rgba(41,35,41,.14);color:#4B444B;font-size:.9rem;line-height:1.5;text-align:center}
.crisis a{color:#653B60;font-weight:700}
</style></head><body><main><p class="brand">Loss<span>Lens</span></p><span class="chip">Under development</span><h1>We&rsquo;re still building LossLens</h1><p class="intro">LossLens is a free, private recovery companion for people affected by betting in Kenya. If you were given access, enter the password below.</p><form method="POST" action="/__gate"><input type="hidden" name="next" value="%NEXT%"><label for="gate-password">Access password</label><input id="gate-password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Enter</button><p class="error" role="alert" aria-live="polite">%ERROR%</p></form><div class="access"><span>Need access?</span><a class="icon-link" href="mailto:projectlosslens@gmail.com?subject=Access%20request" aria-label="Request access by email"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13ZM5 6v.25l7 5.25 7-5.25V6H5Zm14 2.75-6.4 4.8a1 1 0 0 1-1.2 0L5 8.75v9.75h14v-9.75Z"/></svg></a></div><p class="crisis">In crisis? Call <a href="tel:${primaryHelpline.tel}">${escapeHtml(primaryHelpline.name)} ${escapeHtml(primaryHelpline.phone)}</a>.</p></main></body></html>`

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function gatePageResponse(nextValue, error = '') {
  return new Response(
    GATE_HTML.replace('%NEXT%', escapeHtml(nextValue)).replace('%ERROR%', escapeHtml(error)),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}

function unauthorizedJson() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function isAllowlisted(pathname) {
  return ALLOWLIST.some((entry) => {
    if (entry === '/losslens-icon-*.png') {
      return pathname.startsWith('/losslens-icon-') && pathname.endsWith('.png')
    }
    return pathname === entry
  })
}

function passThrough() {
  return next({
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  })
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const pathname = url.pathname

  if (!isGateEnabled()) return next()

  if (pathname === '/__gate' && request.method === 'GET') {
    return gatePageResponse('/', '')
  }

  if (pathname === '/__gate' && request.method === 'POST') {
    const formData = await request.formData()
    const password = String(formData.get('password') ?? '')
    const requestedNext = String(formData.get('next') ?? '/')
    const redirectTarget = isSafeSameOriginRelativePath(requestedNext, url.origin)
      ? requestedNext
      : '/'

    if (matchesGatePassword(password)) {
      const expiry = Date.now() + GATE_COOKIE_TTL_MS
      const cookie = buildGateCookieValue(expiry)
      return new Response(null, {
        status: 303,
        headers: {
          Location: new URL(redirectTarget, url.origin).href,
          'Set-Cookie': buildCookieHeader(GATE_COOKIE_NAME, cookie, { sessionOnly: true }),
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
    return gatePageResponse(redirectTarget, 'That password is not right. Please try again.')
  }

  if (pathname === '/__gate/lock') {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL('/', url.origin).href,
        'Set-Cookie': clearGateCookieHeader(GATE_COOKIE_NAME),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }

  if (isAllowlisted(pathname)) return passThrough()

  const validCookie = verifyGateCookieValue(getGateCookieFromRequest(request)).ok
  if (validCookie) return passThrough()
  if (pathname.startsWith('/api/')) return unauthorizedJson()

  return gatePageResponse(`${pathname}${url.search}`, '')
}
