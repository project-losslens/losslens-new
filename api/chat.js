const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-20b'
const MAX_MESSAGE_LENGTH = 4000
const MAX_MESSAGES = 20
const REQUEST_TIMEOUT_MS = 30000

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
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

  if (!supabaseUrl || !supabaseKey || !token) return null

  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${auth.token}`,
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

function isCrisisMessage(message) {
  const normalized = message.toLowerCase()
  return [
    'suicide', 'kill myself', 'end it all', 'self-harm', 'want to die',
    'kujiua', 'nitajiuwa', 'nataka kufa', 'maisha yameniboa',
  ].some(word => normalized.includes(word))
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }

  const auth = await getAuthenticatedUser(request)
  if (!auth) return json(response, 401, { error: 'Authentication required' })

  const body = request.body || {}
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : []
  if (!messages.length) return json(response, 400, { error: 'A message is required' })

  const cleaned = messages
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .map(message => ({ role: message.role, content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH) }))
    .filter(message => message.content)

  const lastUserMessage = [...cleaned].reverse().find(message => message.role === 'user')
  if (!lastUserMessage) return json(response, 400, { error: 'A user message is required' })

  try {
    await saveHistory(auth, 'user', lastUserMessage.content)
  } catch {
    return json(response, 503, { error: 'Conversation history is temporarily unavailable' })
  }

  let reply
  if (isCrisisMessage(lastUserMessage.content)) {
    reply = "I'm really concerned about you. If you may be in immediate danger, use LossLens crisis resources and contact trusted emergency support now. You can also reach Befrienders Kenya at +254 722 178 177 or NACADA at 1192. You matter and do not have to face this alone."
  } else {
    if (!process.env.GROQ_API_KEY) {
      return json(response, 503, { error: 'AI service is temporarily unavailable' })
    }

    let context = ''
    try {
      context = await fetchUserContext(auth)
    } catch {
      context = ''
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
            ...cleaned,
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
}
