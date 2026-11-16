import { supabase } from './supabase'

// Browser calls the authenticated server endpoints; Groq credentials remain server-side.
// Returns { reply, pendingAction?, action? } — pendingAction needs user confirmation
// via runOlooAction; action is an already-executed read result for card display.
export const askGroq = async (message) => {
  const content = typeof message === 'string' ? message.trim() : ''
  if (!content) return { reply: "I'm here for you. What's on your mind?" }

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) return { reply: 'Please sign in to chat.' }

  const callApi = async (path, payload) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)
    try {
      return await fetch(path, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  try {
    let response = await callApi('/api/chat', { message: content })
    let data = await response.json().catch(() => null)

    if (response.status === 403 && data?.needsConsent) {
      // Oloo sends messages and relevant recovery context to Groq (US).
      const accepted = window.confirm(
        'Allow Oloo to send your chat messages and LossLens recovery context to Groq (a US-based AI provider) so it can reply?\n\n' +
        'Je, ruhusu Oloo kutuma ujumbe wako na taarifa za kurejesha kwenye Groq (kanda ya Marekani) ili aweze kujibu?'
      )
      if (!accepted) return { reply: 'Chat is disabled until you allow data sharing.' }
      const consentResponse = await fetch('/api/consent', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consent: true }),
      })
      const consentResult = await consentResponse.json().catch(() => null)
      if (!consentResponse.ok || consentResult?.ok !== true) {
        return {
          reply: consentResponse.status === 401
            ? 'Your session has expired. Please sign in again to continue.'
            : consentResult?.error || 'Consent could not be saved. Please try again.',
        }
      }
      response = await callApi('/api/chat', { message: content })
      data = await response.json().catch(() => null)
      if (response.status === 403 && data?.needsConsent) {
        return { reply: 'Consent could not be verified. Please close Oloo and try again.' }
      }
    }

    if (!response.ok) {
      return {
        reply: data?.error || (response.status === 429
          ? 'Taking a quick breather. Try me again in a moment.'
          : "Something's not working on my end. Can you try again?"),
      }
    }
    return {
      reply: data?.reply || "Hmm, I lost my train of thought. What were you saying?",
      pendingAction: data?.pendingAction || null,
      action: data?.action || null,
    }
  } catch (error) {
    return {
      reply: error.name === 'AbortError'
        ? 'I took too long to respond. Please try again.'
        : "Looks like my connection dropped. Can you try again?",
    }
  }
}

// Executes a confirmed Oloo action. Only call after the user taps Confirm.
export const runOlooAction = async (action, params = {}) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { ok: false, error: 'Please sign in to continue.' }
  const response = await fetch('/api/actions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, params, confirmed: true }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, error: data?.error || 'Action failed' }
  return data
}
