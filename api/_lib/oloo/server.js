/* global process */

// Shared server helpers for Oloo endpoints. Plain JS — must stay Node-importable
// (no JSX, no import.meta.env, no CSS).

export const REQUEST_TIMEOUT_MS = 30000

export function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

export async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function getAuthenticatedUser(request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  // Vercel env var must hold the sb_publishable_ key.
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

  if (!supabaseUrl || !supabaseKey || !token.startsWith('eyJ')) return null

  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`,
    },
  }, REQUEST_TIMEOUT_MS)

  if (!response.ok) return null
  const user = await response.json()
  return user?.id ? { user, token, supabaseUrl, supabaseKey } : null
}

// ctx passed to action executors — always the caller's own JWT, so PostgREST
// RLS and security-definer RPC authorization apply unchanged.
export function actionContext(auth) {
  return {
    userId: auth.user.id,
    token: auth.token,
    supabaseUrl: auth.supabaseUrl,
    supabaseKey: auth.supabaseKey,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  }
}
