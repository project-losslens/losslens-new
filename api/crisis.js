/* global process */

import { detectCrisis } from '../src/lib/crisisDetection.js'

const REQUEST_TIMEOUT_MS = 30000
const MAX_MESSAGE_LENGTH = 4000

function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!serviceKey || !supabaseUrl || !supabaseKey) {
    return json(response, 500, { error: 'crisis pipeline not configured' })
  }

  try {
    const authorization = request.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token.startsWith('eyJ')) return json(response, 401, { error: 'unauthorized' })

    const userResponse = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!userResponse.ok) return json(response, 401, { error: 'unauthorized' })
    const user = await userResponse.json()
    if (!user?.id) return json(response, 401, { error: 'unauthorized' })

    let body = request.body || {}
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        return json(response, 400, { error: 'invalid_body' })
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => key !== 'message')
        || typeof body.message !== 'string') {
      return json(response, 400, { error: 'A message is required' })
    }

    const message = body.message.trim().slice(0, MAX_MESSAGE_LENGTH)
    if (!message) return json(response, 400, { error: 'A message is required' })
    const crisis = detectCrisis(message)
    if (!crisis.crisis) return json(response, 200, { crisis: false })

    const alertResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/record_crisis_event`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_context: message.slice(0, 500),
        p_keywords: crisis.keywords,
        p_source: 'diary',
        p_max_sessions: 1,
      }),
    })
    if (!alertResponse.ok) {
      console.error('Diary crisis event recording failed:', alertResponse.status, await alertResponse.text())
      return json(response, 500, { error: 'Crisis support could not be activated' })
    }
    return json(response, 200, { crisis: true })
  } catch (error) {
    console.error('Diary crisis pipeline failed:', error?.message || error)
    return json(response, 500, { error: 'Crisis support could not be activated' })
  }
}
