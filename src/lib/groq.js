import { supabase } from './supabase'

// Browser calls the authenticated server endpoint; Groq credentials remain server-side.
export const askGroq = async (message) => {
  const content = typeof message === 'string' ? message.trim() : ''
  if (!content) return "I'm here for you. What's on your mind?"

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) return 'Please sign in to chat.'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)
    let response
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
    const data = await response.json().catch(() => null)
    if (response.status === 403 && data?.needsConsent) {
      // Oloo sends conversation context to Groq (US). Require explicit consent.
      const accepted = window.confirm(
        'Allow Oloo to send your chat messages and LossLens recovery context to Groq (a US-based AI provider) so it can reply?\n\n' +
        'Je, ruhusu Oloo kutuma ujumbe wako na taarifa za kurejesha kwenye Groq (kanda ya Marekani) ili aweze kujibu?'
      )
      if (!accepted) return 'Chat is disabled until you allow data sharing.'
      const consentResponse = await fetch('/api/consent', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consent: true }),
      })
      if (!consentResponse.ok) return 'Consent could not be saved. Please try again.'
      return askGroq(content)
    }
    if (!response.ok) {
      return data?.error || (response.status === 429
        ? 'Taking a quick breather. Try me again in a moment.'
        : "Something's not working on my end. Can you try again?")
    }
    return data?.reply || "Hmm, I lost my train of thought. What were you saying?"
  } catch (error) {
    return error.name === 'AbortError'
      ? 'I took too long to respond. Please try again.'
      : "Looks like my connection dropped. Can you try again?"
  }
}
