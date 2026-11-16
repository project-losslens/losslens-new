// Extracts an optional trailing `ACTION: {...}` directive from an Oloo reply.
// The directive is a proposal only — the server validates it against the
// action registry before anything runs. Plain JS, Node-importable.

const ACTION_LINE = /(?:^|\n)[ \t]*ACTION[ \t]*:[ \t]*(\{[\s\S]*\})[ \t]*\r?\n?[ \t]*$/

export function extractAction(text) {
  if (typeof text !== 'string' || !text) return { reply: text, action: null }
  const match = text.match(ACTION_LINE)
  if (!match) return { reply: text, action: null }

  let action = null
  try {
    const parsed = JSON.parse(match[1])
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
      action = { id: parsed.id.slice(0, 80), params: parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params) ? parsed.params : {} }
    }
  } catch {
    action = null
  }

  const reply = text.slice(0, match.index).trim()
  return { reply: reply || null, action }
}
