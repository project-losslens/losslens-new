import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const GATE_COOKIE_NAME = 'll_gate'
export const GATE_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeGateText(value = '') {
  return String(value ?? '').trim().toLowerCase()
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  const length = Math.max(left.length, right.length)
  const paddedLeft = Buffer.alloc(length, 0)
  const paddedRight = Buffer.alloc(length, 0)

  left.copy(paddedLeft)
  right.copy(paddedRight)

  try {
    return timingSafeEqual(paddedLeft, paddedRight)
  } catch {
    return left.length === right.length && left.toString('binary') === right.toString('binary')
  }
}

export function isGateEnabled(env = process.env) {
  return String(env?.SITE_GATE ?? 'on').toLowerCase() !== 'off'
}

export function gateEnvHasSecrets(env = process.env) {
  return Boolean(env?.SITE_GATE_PASSWORD && env?.SITE_GATE_SECRET)
}

export function matchesGatePassword(candidate, expected = process.env.SITE_GATE_PASSWORD) {
  return constantTimeEqual(normalizeGateText(candidate), normalizeGateText(expected))
}

export function hashGatePassword(value) {
  return createHash('sha256').update(normalizeGateText(value)).digest('hex')
}

export function buildGateCookieValue(expiryMs, secret) {
  const expiry = String(expiryMs)
  const signature = createHmac('sha256', String(secret ?? '')).update(expiry).digest('hex')
  return `${expiry}.${signature}`
}

export function verifyGateCookieValue(rawValue, secret) {
  if (!rawValue) {
    return { ok: false, expired: false, reason: 'missing' }
  }

  const [expiryRaw, signature] = String(rawValue).split('.')
  if (!expiryRaw || !signature) {
    return { ok: false, expired: false, reason: 'malformed' }
  }

  const expected = createHmac('sha256', String(secret ?? '')).update(expiryRaw).digest('hex')
  if (!constantTimeEqual(signature, expected)) {
    return { ok: false, expired: false, reason: 'invalid-signature' }
  }

  const expiry = Number(expiryRaw)
  if (!Number.isFinite(expiry)) {
    return { ok: false, expired: false, reason: 'invalid-expiry' }
  }

  if (expiry <= Date.now()) {
    return { ok: false, expired: true, reason: 'expired' }
  }

  return { ok: true, expired: false, expiry, reason: 'ok' }
}

export function parseCookieHeader(cookieHeader = '') {
  const cookies = {}
  for (const chunk of String(cookieHeader).split(';')) {
    const [name, ...rest] = chunk.split('=')
    const key = name.trim()
    if (!key) continue
    cookies[key] = rest.join('=').trim()
  }
  return cookies
}

export function getGateCookieFromRequest(request) {
  const header = typeof request === 'string' ? request : request?.headers?.get?.('cookie') ?? ''
  return parseCookieHeader(header)[GATE_COOKIE_NAME] ?? ''
}

export function buildCookieHeader(name, value, { maxAgeMs = GATE_COOKIE_TTL_MS, path = '/', sameSite = 'Lax' } = {}) {
  const maxAgeSeconds = Math.max(0, Math.floor(maxAgeMs / 1000))
  const expires = new Date(Date.now() + maxAgeMs).toUTCString()
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=${sameSite}; Secure; Max-Age=${maxAgeSeconds}; Expires=${expires}`
}

export function clearGateCookieHeader(name = GATE_COOKIE_NAME) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function isSafeSameOriginRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false
  if (!value.startsWith('/')) return false
  return true
}
