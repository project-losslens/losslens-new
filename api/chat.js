import { crisisOutcome } from './_lib/crisis.js'
/* global process */

import { detectCrisis } from '../src/lib/crisisDetection.js'
import { getEntitlements } from '../src/lib/entitlements.js'
import { OLOO_KNOWLEDGE, OLOO_ACTION_PROTOCOL } from './_lib/oloo/knowledge.js'
import { extractAction } from './_lib/oloo/protocol.js'
import { getAction } from './_lib/oloo/actions.js'
import { actionContext } from './_lib/oloo/server.js'

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


const BASE_SYSTEM_PROMPT = `You are Oloo, a warm, perceptive gambling-recovery companion built into LossLens in Kenya.

Listen first and respond empathetically without judgement. Support gambling recovery, urges, triggers, reflection, and practical CBT exercises. Match the user's language, including Kiswahili, Sheng, English, or Kenyan mother tongues.

Never diagnose anyone, claim to be a licensed therapist, or present yourself as Groq or another AI model. Never provide gambling tips, odds, betting strategies, or emergency contact details that are not already provided by LossLens.

If a user may be in immediate danger, self-harming, or considering suicide, encourage them to use LossLens crisis resources and seek immediate trusted or professional support. Clearly state that you are not their only source of support.
Default to 1–3 short sentences and aim for under 60 words. Lead with the answer. If useful, offer one practical next step or ask one focused question. Skip recaps and unsolicited lists. Give more detail when the user asks for it or when safety or an action confirmation requires it.

${OLOO_KNOWLEDGE}

${OLOO_ACTION_PROTOCOL}`

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

function safeDatabaseErrorCode(payload) {
  const code = payload?.code
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : null
}

async function reportDatabaseFailure(operation, response) {
  const payload = await response.clone().json().catch(() => null)
  console.error('Oloo Supabase request failed:', {
    operation,
    upstreamStatus: response.status,
    errorCode: safeDatabaseErrorCode(payload),
  })
  return {
    upstreamStatus: response.status,
    upstreamCode: safeDatabaseErrorCode(payload),
  }
}

function reportNetworkFailure(operation, error) {
  console.error('Oloo upstream request failed:', {
    operation,
    category: error?.name === 'AbortError' ? 'timeout' : 'network_error',
  })
}

function reportOperationFailure(operation, error) {
  if (!error?.upstreamStatus) reportNetworkFailure(operation, error)
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
  if (!user?.id) return null
  const profileResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=status,must_change_password&limit=1`, {
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + token,
    },
  }, REQUEST_TIMEOUT_MS)
  if (!profileResponse.ok) return null
  const profiles = await profileResponse.json()
  const profile = profiles?.[0]
  if (!profile || profile.status === 'suspended' || profile.must_change_password) return null
  return { user, token, supabaseUrl, supabaseKey }
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
  let pgsi = null
  try {
    const response = await fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/rpc/pgsi_oloo_context`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
    }, 5000)
    if (response.ok) {
      const value = await response.json()
      if (['none','low','moderate','high'].includes(value?.band) && Number.isFinite(Date.parse(value.completed_at))) {
        pgsi = { band: value.band, completed_at: new Date(value.completed_at).toISOString() }
      }
    }
  } catch { /* Fail closed for PGSI personalization; never log assessment data. */ }
  context += pgsi
    ? ` Optional PGSI context explicitly enabled by the member: band=${pgsi.band}, completed=${pgsi.completed_at}. Use this lightly for tone and relevant support. Listen to the current message. Do not bring up the score every time, repeat the questionnaire, infer a diagnosis, compare weekly changes, decide cover eligibility, or notify anyone.`
    : ' PGSI personalization is off or unavailable. Do not use or infer stored PGSI information from earlier conversation history. Respond to what the person says now.'
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

// Privileged write: ai_data_consent_at is a protected profile field, so the
// user JWT cannot PATCH it (enforce_profile_privilege_updates). The consent
// endpoint therefore writes with the service-role key, scoped to the single
// authenticated user's own row.
async function recordConsent(auth) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('CONSENT_SERVICE_NOT_CONFIGURED')
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const profileUrl = `${auth.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.user.id)}`
  let response
  try {
    response = await fetchWithTimeout(
      `${profileUrl}&ai_data_consent_at=is.null&select=id,ai_data_consent_at`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ai_data_consent_at: new Date().toISOString() }),
      },
      REQUEST_TIMEOUT_MS,
    )
  } catch (error) {
    reportNetworkFailure('consent.write', error)
    throw new Error('CONSENT_WRITE_FAILED', { cause: error })
  }
  if (!response.ok) {
    await reportDatabaseFailure('consent.write', response)
    throw new Error('CONSENT_WRITE_FAILED')
  }
  const rows = await response.json().catch(() => null)
  if (Array.isArray(rows) && rows.length === 1
      && rows[0]?.id === auth.user.id && Boolean(rows[0].ai_data_consent_at)) return

  // A retry can find the original timestamp already stored. Preserve it and
  // report success only after confirming the caller's own profile has consent.
  let existingResponse
  try {
    existingResponse = await fetchWithTimeout(
      `${profileUrl}&select=id,ai_data_consent_at&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
      REQUEST_TIMEOUT_MS,
    )
  } catch (error) {
    reportNetworkFailure('consent.verify', error)
    throw new Error('CONSENT_WRITE_FAILED', { cause: error })
  }
  if (!existingResponse.ok) {
    await reportDatabaseFailure('consent.verify', existingResponse)
    throw new Error('CONSENT_WRITE_FAILED')
  }
  const existingRows = await existingResponse.json().catch(() => null)
  if (Array.isArray(existingRows) && existingRows.length === 1
      && existingRows[0]?.id === auth.user.id && Boolean(existingRows[0].ai_data_consent_at)) return
  if (Array.isArray(existingRows) && existingRows.length === 0) {
    throw new Error('CONSENT_PROFILE_NOT_FOUND')
  }
  throw new Error('CONSENT_WRITE_FAILED')
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
  if (!response.ok) {
    const error = new Error('CHAT_HISTORY_WRITE_FAILED')
    Object.assign(error, await reportDatabaseFailure(`chat_history.${role}_write`, response))
    throw error
  }
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

async function callGroq(messages) {
  const groqResponse = await fetchWithTimeout(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 700,
      temperature: 0.8,
    }),
  }, REQUEST_TIMEOUT_MS)

  const data = await groqResponse.json().catch(() => null)
  if (!groqResponse.ok) {
    console.error('Oloo Groq request failed:', {
      upstreamStatus: groqResponse.status,
      errorCode: safeDatabaseErrorCode(data),
    })
    if (groqResponse.status === 429) return { error: 'busy' }
    if (groqResponse.status >= 500) return { error: 'unavailable' }
    return { error: 'failed' }
  }
  const content = data?.choices?.[0]?.message?.content?.trim()
  return content ? { content } : { error: 'empty' }
}

// Runs a validated read-only action, then asks Groq to comment on the real
// result so Oloo stays conversational. Returns payload fields for the client.
async function runReadAction(auth, actionId, params, priorMessages, replyText) {
  const def = getAction(actionId)
  if (!def || def.confirm) return null
  const ctx = actionContext(auth)
  let result
  try {
    result = await def.run(ctx, params && typeof params === 'object' ? params : {})
  } catch {
    result = { ok: false, error: 'action_failed' }
  }
  const resultJson = JSON.stringify(result?.data ?? result).slice(0, 6000)
  const followup = await callGroq([
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}${OLOO_KNOWLEDGE}\n\n${OLOO_ACTION_PROTOCOL}` },
    ...priorMessages,
    { role: 'assistant', content: replyText || '' },
    { role: 'user', content: `[system] Action "${actionId}" result: ${resultJson}. Briefly tell the user what happened or what you found, in 1-3 sentences, using only this data. If it failed, say so plainly.` },
  ])
  return {
    action: {
      id: actionId,
      ok: Boolean(result?.ok),
      summary: typeof result?.summary === 'string' ? result.summary.slice(0, 500) : null,
      data: result?.ok ? result.data : null,
      error: result?.ok ? null : (result?.error || 'Action failed'),
    },
    followupReply: followup.content || null,
  }
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
  if (!response.ok) {
    const error = new Error('CHAT_HISTORY_READ_FAILED')
    Object.assign(error, await reportDatabaseFailure('chat_history.read', response))
    throw error
  }
  const rows = await response.json()
  return rows.reverse()
    .filter(row => ['user', 'assistant'].includes(row.role) && typeof row.message === 'string')
    .map(row => ({ role: row.role, content: row.message.slice(0, MAX_MESSAGE_LENGTH) }))
}

// Crisis responses are returned only after the alert and voucher pipeline succeeds.
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }

  try {

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

  // Urgent human help is independent of the AI service, consent, history, or quotas.
  const triage = detectCrisis(message)
  if (triage.crisis) return json(response, 200, await crisisOutcome(auth, message, triage, 'chat'))

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
  } catch (error) {
    reportOperationFailure('chat_history.read', error)
    return json(response, 503, {
      error: 'Conversation history could not be loaded.',
      code: 'CHAT_HISTORY_READ_UNAVAILABLE',
    })
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
  } catch (error) {
    reportOperationFailure('chat_history.user_write', error)
    return json(response, 503, {
      error: 'Your message could not be saved to conversation history.',
      code: 'CHAT_USER_MESSAGE_SAVE_UNAVAILABLE',
    })
  }

  let reply
  let pendingAction = null
  let actionPayload = null
  {
    if (!process.env.GROQ_API_KEY) {
      console.error('Oloo configuration error:', {
        operation: 'chat.groq',
        category: 'missing_api_key',
      })
      return json(response, 503, {
        error: 'AI service is temporarily unavailable.',
        code: 'AI_SERVICE_NOT_CONFIGURED',
      })
    }

    let context
    try {
      context = await fetchUserContext(auth)
    } catch {
      // User context is optional.
    }

    try {
      const groqMessages = [
        { role: 'system', content: `${BASE_SYSTEM_PROMPT}${context ? `\n\nPrivate user context from LossLens: ${context}` : ''}` },
        ...history,
        { role: 'user', content: message },
      ]
      const groqResult = await callGroq(groqMessages)
      if (groqResult.error === 'busy') return json(response, 429, { error: 'Oloo is busy right now. Please try again shortly.' })
      if (groqResult.error) return json(response, 502, { error: 'Oloo is temporarily unavailable. Please try again shortly.' })
      reply = groqResult.content
      if (!reply) return json(response, 502, { error: 'Oloo could not respond. Please try again.' })

      // ── Action protocol: the model may append `ACTION: {"id":...,"params":{...}}`.
      const { reply: cleanReply, action } = extractAction(reply)
      if (action) {
        const def = getAction(action.id)
        if (!def) {
          reply = cleanReply || reply
        } else if (def.confirm) {
          // Consequential action — return a pending proposal; the client must
          // POST /api/actions after the user explicitly confirms.
          reply = cleanReply || `Ready to ${action.id.replace(/[._]/g, ' ')} — please confirm below.`
          pendingAction = {
            id: action.id,
            params: action.params,
            summary: typeof def.describe === 'function'
              ? def.describe(action.params || {})
              : `${action.id.replace(/[._]/g, ' ')}: ${JSON.stringify(action.params).slice(0, 400)}`,
          }
        } else {
          const outcome = await runReadAction(auth, action.id, action.params, groqMessages, cleanReply || reply)
          if (outcome) {
            reply = outcome.followupReply || cleanReply || reply
            actionPayload = outcome.action
          } else {
            reply = cleanReply || reply
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return json(response, 504, { error: 'Oloo took too long to respond. Please try again.' })
      return json(response, 502, { error: 'Oloo is temporarily unavailable. Please try again shortly.' })
    }
  }

  try {
    await saveHistory(auth, 'assistant', reply)
  } catch (error) {
    reportOperationFailure('chat_history.assistant_write', error)
    return json(response, 503, {
      error: 'The reply could not be saved to conversation history.',
      code: 'CHAT_ASSISTANT_MESSAGE_SAVE_UNAVAILABLE',
    })
  }

  return json(response, 200, {
    reply,
    ...(pendingAction ? { pendingAction } : {}),
    ...(actionPayload ? { action: actionPayload } : {}),
  })
  } catch (error) {
    console.error('Oloo request failed:', {
      category: error?.name === 'AbortError' ? 'timeout' : 'unexpected_error',
    })
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
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).length !== 1 || body.consent !== true) {
      return json(response, 400, { error: 'Explicit consent is required' })
    }
    await recordConsent(auth)
    return json(response, 200, { ok: true })
  } catch (error) {
    if (error?.message === 'CONSENT_SERVICE_NOT_CONFIGURED') {
      console.error('Oloo configuration error:', {
        operation: 'consent.write',
        category: 'missing_service_role_key',
      })
      return json(response, 503, {
        error: 'Consent service is temporarily unavailable.',
        code: 'CONSENT_SERVICE_NOT_CONFIGURED',
      })
    }
    if (error?.message === 'CONSENT_PROFILE_NOT_FOUND') {
      return json(response, 404, { error: 'Your profile could not be found.' })
    }
    if (error?.message !== 'CONSENT_WRITE_FAILED') {
      console.error('Oloo consent request failed:', {
        operation: 'consent.authenticate',
        category: error?.name === 'AbortError' ? 'timeout' : 'unexpected_error',
      })
    }
    return json(response, 503, {
      error: 'Consent could not be recorded. Please try again.',
      code: 'CONSENT_WRITE_UNAVAILABLE',
    })
  }
}
