let NextResponse
try {
  ; ({ NextResponse } = await import('next/server'))
} catch {
  NextResponse = null
}

import {
  GATE_COOKIE_NAME,
  GATE_COOKIE_TTL_MS,
  buildCookieHeader,
  buildGateCookieValue,
  clearGateCookieHeader,
  getGateCookieFromRequest,
  isGateEnabled,
  gateEnvHasSecrets,
  isSafeSameOriginRelativePath,
  matchesGatePassword,
  verifyGateCookieValue,
} from './lib/gate.js'

const ALLOWLIST = [
  '/__gate',
  '/__gate/lock',
  '/favicon.svg',
  '/manifest.json',
  '/service-worker.js',
  '/robots.txt',
]

const GATE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>LossLens gate</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1220;color:#e5f6ff;font-family:system-ui,sans-serif} .card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:20px;max-width:460px;width:min(92vw,460px);padding:32px 24px;box-shadow:0 30px 70px rgba(0,0,0,.35)} .chip{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(45,212,191,.12);color:#2DD4BF;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.h1{font-size:clamp(2rem,3vw,2.6rem);margin:16px 0 12px}.p{margin:0 0 18px;line-height:1.6;color:#d4eaf7}.field{display:flex;flex-direction:column;gap:8px}.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9acfe8}.input-wrap{display:flex;align-items:center;gap:8px;background:#091320;border:1px solid rgba(125,189,238,.4);border-radius:12px;padding:0 12px}.input{width:100%;box-sizing:border-box;background:transparent;border:none;outline:none;padding:12px 0;font-size:1rem;color:white}.toggle{border:none;background:none;color:#7DBDEE;font-weight:700;cursor:pointer}.submit{margin-top:16px;width:100%;padding:12px 16px;border:none;border-radius:12px;background:#2DD4BF;color:#08141f;font-weight:700;cursor:pointer}.error{margin-top:12px;color:#ffb8b8;min-height:20px}.help{margin-top:18px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;color:#b6d4e8}.icon-link{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid rgba(255,255,255,0.12);border-radius:50%;background:rgba(255,255,255,0.03);color:#7DBDEE} .icon-link svg{width:18px;height:18px;fill:currentColor}.meta{margin-top:14px;font-size:12px;color:#9acfe8;text-align:center}.meta a{color:#7DBDEE;text-decoration:none}</style></head><body><main class="card"><span class="chip">Under development</span><h1 class="h1">Access required</h1><p class="p">LossLens is private while we finish the public release. Enter the site password to continue.</p><form method="POST" action="/__gate"><input type="hidden" name="next" value="%NEXT%"><div class="field"><label class="label" for="password">Password</label><div class="input-wrap"><input id="password" class="input" type="password" name="password" autocomplete="off" required><button class="toggle" type="button" aria-label="Toggle password visibility" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">Show</button></div></div><button class="submit" type="submit">Enter</button><div class="error">%ERROR%</div></form><div class="help"><a class="icon-link" href="mailto:projectlosslens@gmail.com?subject=Access%20request" aria-label="Email access request"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.8A2 2 0 0 1 5 4.8h14a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.8Zm2.2-.8 7.8 5.9 7.8-5.9H5.2Zm14.8 11.3V7.6l-7.1 5.3a1 1 0 0 1-1.2 0L4.2 7.6v10.7h15.8Z"/></svg></a><a class="icon-link" href="tel:0800722030" aria-label="Call crisis helpline"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.6 3.2 4.3 5.9 7.5 7.5l2.5-2.5a1.4 1.4 0 0 1 1.4-.3c1.5.5 3.1.8 4.7.8a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1C11.5 22 2 12.5 2 3a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1c0 1.6.3 3.2.8 4.7.2.5.1 1-.3 1.4L6.6 10.8Z"/></svg></a></div><p class="meta"><a href="tel:0800722030">Crisis support</a></p></main></body></html>`

function addRobotsHeaders(headers) {
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  headers.set('Cache-Control', 'no-store')
  return headers
}

function passThroughResponse() {
  if (NextResponse) {
    const res = NextResponse.next()
    const headers = new Headers(res.headers)
    addRobotsHeaders(headers)
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  return new Response(null, {
    status: 200,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  })
}

function gatePageHtml(nextValue = '/', error = '') {
  return GATE_HTML.replace('%NEXT%', escapeHtml(nextValue)).replace('%ERROR%', escapeHtml(error))
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildGatePageResponse(nextValue, error = '') {
  const html = gatePageHtml(nextValue, error)
  return new Response(html, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function buildUnauthorizedJson() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function buildMisconfiguredPage() {
  return new Response('LossLens gate is misconfigured. Please contact the site owner.', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function isGateBypassPath(pathname) {
  if (ALLOWLIST.includes(pathname)) return true
  if (pathname.startsWith('/losslens-icon-')) return true
  return false
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const pathname = url.pathname

  if (isGateBypassPath(pathname)) {
    return passThroughResponse()
  }

  const env = {
    SITE_GATE: process.env.SITE_GATE ?? 'on',
    SITE_GATE_PASSWORD: process.env.SITE_GATE_PASSWORD,
    SITE_GATE_SECRET: process.env.SITE_GATE_SECRET,
  }

  if (!isGateEnabled(env)) {
    return passThroughResponse()
  }

  if (!gateEnvHasSecrets(env)) {
    return buildMisconfiguredPage()
  }

  if (pathname === '/__gate' && request.method === 'GET') {
    return buildGatePageResponse('/', '')
  }

  if (pathname === '/__gate' && request.method === 'POST') {
    const formData = await request.formData()
    const password = String(formData.get('password') ?? '')
    const requestedNext = String(formData.get('next') ?? '/')
    const redirectTarget = isSafeSameOriginRelativePath(requestedNext) ? requestedNext : '/'

    if (matchesGatePassword(password, env.SITE_GATE_PASSWORD)) {
      const expiryMs = Date.now() + GATE_COOKIE_TTL_MS
      const cookieValue = buildGateCookieValue(expiryMs, env.SITE_GATE_SECRET)
      const response = NextResponse
        ? NextResponse.redirect(new URL(redirectTarget, request.url), 303)
        : Response.redirect(new URL(redirectTarget, request.url), 303)

      const setCookie = buildCookieHeader(GATE_COOKIE_NAME, cookieValue, {
        maxAgeMs: GATE_COOKIE_TTL_MS,
        path: '/',
        sameSite: 'Lax',
      })
      response.headers.set('Set-Cookie', setCookie)
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
    return buildGatePageResponse(redirectTarget, 'That password is not right. Please try again.')
  }

  if (pathname === '/__gate/lock') {
    const response = NextResponse
      ? NextResponse.redirect(new URL('/', request.url), 303)
      : Response.redirect(new URL('/', request.url), 303)

    response.headers.set('Set-Cookie', clearGateCookieHeader(GATE_COOKIE_NAME))
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const cookieValue = getGateCookieFromRequest(request)
  const ok = verifyGateCookieValue(cookieValue, env.SITE_GATE_SECRET)
  if (ok.ok) {
    return passThroughResponse()
  }

  if (pathname.startsWith('/api/')) {
    return buildUnauthorizedJson()
  }

  return buildGatePageResponse(pathname || '/', '')
}

export const config = {
  matcher: ['/((?!_next|_vercel|assets).*)'],
}
