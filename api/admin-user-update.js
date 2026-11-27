import { SITE_ORIGIN } from '../src/config/site.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) {
    return res.status(401).json({ error: 'Your session expired or could not be verified. Sign in again.' })
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'A JSON account update is required.' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const apikey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !apikey) {
    return res.status(503).json({ error: 'The account service is missing its Supabase project configuration.' })
  }

  try {
    const upstream = await fetch(new URL('/functions/v1/admin-user-update', url), {
      method: 'POST',
      headers: { authorization, apikey, origin: SITE_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    const body = await upstream.json().catch(() => null)
    if (body) return res.status(upstream.status).json(body)
    return res.status(502).json({ error: `The account service returned an unexpected response (HTTP ${upstream.status}).` })
  } catch {
    return res.status(502).json({ error: 'The account service could not reach Supabase.' })
  }
}
