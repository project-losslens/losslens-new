/* global process */

import { detectCrisis, CRISIS_HELPLINE } from '../src/lib/crisisDetection.js'
import { getEntitlements } from '../src/lib/entitlements.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-20b'
const MAX_MESSAGE_LENGTH = 4000
const MAX_MESSAGES = 20
const REQUEST_TIMEOUT_MS = 30000
const QUOTA_PER_HOUR = Number(process.env.CHAT_QUOTA_PER_HOUR || 30)
const QUOTA_PER_DAY = Number(process.env.CHAT_QUOTA_PER_DAY || 150)
// Plans with aiPriority get a larger rolling quota ("priority AI responses").
const QUOTA_PRIORITY_PER_HOUR = Number(process.env.CHAT_QUOTA_PRIORITY_PER_HOUR || 90)
const QUOTA_PRIORITY_PER_DAY = Number(process.env.CHAT_QUOTA_PRIORITY_PER_DAY || 400)

// TODO(owner): verify the helpline numbers below are current before release.
const CRISIS_REPLY = `I'm really concerned about you. If you may be in immediate danger, please reach out now — ${CRISIS_HELPLINE}, or NACADA at 1192. You can also use the crisis resources inside LossLens. You matter and you are not alone.`

const BASE_SYSTEM_PROMPT = `You are Oloo, a warm, perceptive gambling-recovery companion built into LossLens in Kenya.

Listen first and respond empathetically without judgement. Support gambling recovery, urges, triggers, reflection, and practical CBT exercises. Match the user's language, including Kiswahili, Sheng, English, or Kenyan mother tongues.

Never diagnose anyone, claim to be a licensed therapist, or present yourself as Groq or another AI model. Never provide gambling tips, odds, betting strategies, or emergency contact details that are not already provided by LossLens.

If a user may be in immediate danger, self-harming, or considering suicide, encourage them to use LossLens crisis resources and seek immediate trusted or professional support. Clearly state that you are not their only source of support.
Stay conversational and avoid long lists unless the user asks for structure. Keep most replies concise. Encourage practical next steps and real-world support.`

function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getAuthenticatedUser(request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
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

async function fetchUserContext(auth) {
  const headers = {
    apikey: auth.supabaseKey,
      Authorization: `Bearer ${auth.token}`,
  }
  const [profileResponse, diaryResponse, cbtResponse] = await Promise.all([
    fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}&select=full_name,streak_days,money_saved&limit=1`, { headers }, REQUEST_TIMEOUT_MS),
    fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/diary_entries?user_id=eq.${auth.user.id}&select=mood,gambled,triggers,notes&order=created_at.desc&limit=7`, { headers }, REQUEST_TIMEOUT_MS),
    fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/cbt_progress?user_id=eq.${auth.user.id}&completed=eq.true&select=id`, { headers }, REQUEST_TIMEOUT_MS),
  ])

  let context = ''
  if (profileResponse.ok) {
    const profiles = await profileResponse.json()
    const profile = profiles?.[0]
    if (profile) {
      context += `LossLens profile context: ${profile.full_name || 'the user'}${profile.streak_days != null ? `, ${profile.streak_days} days gamble-free` : ''}.`
    }
  }
  if (diaryResponse.ok) {
    const entries = await diaryResponse.json()
    if (entries?.length) {
      const latest = entries[0]
      context += ` Latest diary mood: ${latest.mood || 'not recorded'}. ${latest.gambled ? 'Most recent entry records gambling.' : 'Most recent entry records a clean day.'}`
      if (Array.isArray(latest.triggers) && latest.triggers.length) context += ` Recent triggers: ${latest.triggers.slice(0, 5).join(', ')}.`
    }
  }
  if (cbtResponse.ok) {
    const modules = await cbtResponse.json()
    if (modules?.length) context += ` CBT modules completed: ${modules.length}.`
  }
  return context
}

async function fetchConsentState(auth) {
  const headers = {
    apikey: auth.supabaseKey,
    Authorization: `Bearer ${auth.token}`,
  }
  const response = await fetchWithTimeout(
    `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}&select=ai_data_consent_at,subscription_plan,subscription_status,subscription_expires_at,plan_type&limit=1`,
    { headers }, REQUEST_TIMEOUT_MS)
  if (!response.ok) return null
  const rows = await response.json()
  return rows?.[0] ?? null
}

async function recordConsent(auth) {
  const response = await fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH',
    headers: {
      apikey: auth.supabaseKey,
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ai_data_consent_at: new Date().toISOString() }),
  }, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error('CONSENT_WRITE_FAILED')
}

async function saveHistory(auth, role, message) {
  const response = await fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/chat_history`, {
    method: 'POST',
    headers: {
      apikey: auth.supabaseKey,
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ user_id: auth.user.id, role, message }),
  }, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error('CHAT_HISTORY_WRITE_FAILED')
}

async function countRecentMessages(auth, sinceIso) {
  const headers = {
    apikey: auth.supabaseKey,
    Authorization: `Bearer ${auth.token}`,
    Prefer: 'count=exact',
    Range: '0-0',
  }
  const response = await fetchWithTimeout(
    `${auth.supabaseUrl}/rest/v1/chat_history?user_id=eq.${auth.user.id}&role=eq.user&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
    { headers }, REQUEST_TIMEOUT_MS)
  if (!response.ok) return null
  const range = response.headers.get('content-range') || ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : null
}

async function fetchChatHistory(auth) {
  const response = await fetchWithTimeout(
    `${auth.supabaseUrl}/rest/v1/chat_history?user_id=eq.${auth.user.id}&role=in.(user,assistant)&select=role,message&order=created_at.desc&limit=${MAX_MESSAGES}`,
    {
      headers: {
        apikey: auth.supabaseKey,
        Authorization: `Bearer ${auth.token}`,
      },
    },
    REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error('CHAT_HISTORY_READ_FAILED')
  const rows = await response.json()
  return rows.reverse()
    .filter(row => ['user', 'assistant'].includes(row.role) && typeof row.message === 'string')
    .map(row => ({ role: row.role, content: row.message.slice(0, MAX_MESSAGE_LENGTH) }))
}

// Crisis responses are returned only after the alert and voucher pipeline succeeds.
async function recordCrisisAlert(auth, message, keywords) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) throw new Error('CRISIS_PIPELINE_NOT_CONFIGURED')
    const key = serviceKey
    const token = serviceKey
    const headers = {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const alertResponse = await fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/rpc/record_crisis_event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_user_id: auth.user.id,
        p_keywords: keywords,
        p_context: String(message).slice(0, 500),
        p_source: 'chat',
        p_max_sessions: 1,
      }),
    }, REQUEST_TIMEOUT_MS)
    if (!alertResponse.ok) {
      console.error('crisis event recording failed:', alertResponse.status, await alertResponse.text())
      throw new Error('CRISIS_EVENT_RECORDING_FAILED')
    }
  } catch (error) {
    console.error('crisis event recording failed:', error?.message || error)
    throw error
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(response, 500, { error: 'crisis pipeline not configured' })
    }

    const authorization = request.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token.startsWith('eyJ')) {
      return json(response, 401, { error: 'unauthorized' })
    }

    const auth = await getAuthenticatedUser(request)
    if (!auth) return json(response, 401, { error: 'unauthorized' })

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

  // Consent gate: AI chat sends user context to Groq (US). Require explicit opt-in.
  let profile
  try {
    profile = await fetchConsentState(auth)
    if (!profile) return json(response, 500, { error: 'Profile could not be loaded' })
    if (!profile.ai_data_consent_at) {
      return json(response, 403, { needsConsent: true })
    }
  } catch {
    return json(response, 500, { error: 'Consent state could not be verified' })
  }

  let history
  try {
    history = await fetchChatHistory(auth)
  } catch {
    return json(response, 503, { error: 'Conversation history is temporarily unavailable' })
  }

  // ── Quota: per-user rolling limits on stored history.
  // Plans with aiPriority (premium/company/protection) get a higher cap. ──
  const aiPriority = getEntitlements(profile).aiPriority
  const quotaPerHour = aiPriority ? QUOTA_PRIORITY_PER_HOUR : QUOTA_PER_HOUR
  const quotaPerDay = aiPriority ? QUOTA_PRIORITY_PER_DAY : QUOTA_PER_DAY
  try {
    const now = Date.now()
    const [hourCount, dayCount] = await Promise.all([
      countRecentMessages(auth, new Date(now - 3600_000).toISOString()),
      countRecentMessages(auth, new Date(now - 86400_000).toISOString()),
    ])
    if (hourCount == null || dayCount == null) {
      return json(response, 500, { error: 'Chat quota could not be verified' })
    }
    if (hourCount >= quotaPerHour || dayCount >= quotaPerDay) {
      return json(response, 429, { error: 'Message limit reached. Please take a break and try again later.' })
    }
  } catch (error) {
    console.error('Chat quota check failed:', error?.message || error)
    return json(response, 500, { error: 'Chat quota could not be verified' })
  }

  try {
    await saveHistory(auth, 'user', message)
  } catch {
    return json(response, 503, { error: 'Conversation history is temporarily unavailable' })
  }

  let reply
  const crisis = detectCrisis(message)
  if (crisis.crisis) {
    reply = CRISIS_REPLY
    try {
      await recordCrisisAlert(auth, message, crisis.keywords)
    } catch (error) {
      return json(response, 500, {
        error: error.message === 'CRISIS_PIPELINE_NOT_CONFIGURED'
          ? 'crisis pipeline not configured'
          : 'Crisis support could not be activated',
      })
    }
  } else {
    if (!process.env.GROQ_API_KEY) {
      return json(response, 503, { error: 'AI service is temporarily unavailable' })
    }

    let context
    try {
      context = await fetchUserContext(auth)
    } catch {
      // User context is optional.
    }

    try {
      const groqResponse = await fetchWithTimeout(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: `${BASE_SYSTEM_PROMPT}${context ? `\n\nPrivate user context from LossLens: ${context}` : ''}` },
            ...history,
            { role: 'user', content: message },
          ],
          max_tokens: 300,
          temperature: 0.8,
        }),
      }, REQUEST_TIMEOUT_MS)

      const data = await groqResponse.json().catch(() => null)
      if (!groqResponse.ok) {
        if (groqResponse.status === 429) return json(response, 429, { error: 'Oloo is busy right now. Please try again shortly.' })
        if (groqResponse.status >= 500) return json(response, 502, { error: 'Oloo is temporarily unavailable. Please try again shortly.' })
        return json(response, 502, { error: 'Oloo could not respond. Please try again.' })
      }
      reply = data?.choices?.[0]?.message?.content?.trim()
      if (!reply) return json(response, 502, { error: 'Oloo could not respond. Please try again.' })
    } catch (error) {
      if (error.name === 'AbortError') return json(response, 504, { error: 'Oloo took too long to respond. Please try again.' })
      return json(response, 502, { error: 'Oloo is temporarily unavailable. Please try again shortly.' })
    }
  }

  try {
    await saveHistory(auth, 'assistant', reply)
  } catch {
    return json(response, 503, { error: 'Conversation history could not be saved. Please try again.' })
  }

  return json(response, 200, { reply })
  } catch (error) {
    console.error(error)
    return json(response, 500, { error: 'internal' })
  }
}

// POST /api/consent — records explicit AI-data consent on the caller's profile.
export async function consentHandler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) return json(response, 401, { error: 'unauthorized' })
    let body = request.body || {}
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { return json(response, 400, { error: 'invalid_body' }) }
    }
    if (!body || typeof body !== 'object' || body.consent !== true) {
      return json(response, 400, { error: 'Explicit consent is required' })
    }
    await recordConsent(auth)
    return json(response, 200, { ok: true })
  } catch (error) {
    console.error('Consent recording failed:', error?.message || error)
    return json(response, 500, { error: 'Consent could not be recorded' })
  }
}
