import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Temporary gate. Change GATE_PASSWORD here, or set GATE_ENABLED = false, to change or remove it.
export const GATE_ENABLED = true
export const GATE_PASSWORD = 'sixtus'
export const GATE_SECRET = 'ESp4NT5R2AjjaF0kWl5j4R7yTV4ncsB708ssPZhhr-0'

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
  const contentsMatch = timingSafeEqual(paddedLeft, paddedRight)
  return contentsMatch && left.length === right.length
}

export function isGateEnabled() {
  return GATE_ENABLED
}

export function matchesGatePassword(candidate, expected = GATE_PASSWORD) {
  return constantTimeEqual(normalizeGateText(candidate), normalizeGateText(expected))
}

export function buildGateCookieValue(expiryMs, secret = GATE_SECRET) {
  const expiry = String(expiryMs)
  const signature = createHmac('sha256', String(secret ?? '')).update(expiry).digest('hex')
  return `${expiry}.${signature}`
}

export function verifyGateCookieValue(rawValue, secret = GATE_SECRET) {
  if (!rawValue) {
    return { ok: false, expired: false, reason: 'missing' }
  }

  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(String(rawValue))
  if (!match) {
    return { ok: false, expired: false, reason: 'malformed' }
  }

  const [, expiryRaw, signature] = match
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

export function isSafeSameOriginRelativePath(value, origin = 'https://losslens.invalid') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false
  if (value.includes('\\') || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false

  try {
    return new URL(value, origin).origin === origin
  } catch {
    return false
  }
}
