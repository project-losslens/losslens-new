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
