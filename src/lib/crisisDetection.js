// Client-side mirror of the crisis keyword detector used by api/chat.js.
// Keep CRISIS_KEYWORDS and normalisation in sync with the server copy —
// the authoritative detection runs server-side before the model is called.

export const CRISIS_HELPLINE = 'Befrienders Kenya: +254 722 178 177 (free, confidential)'

const CRISIS_KEYWORDS = [
  // English
  'suicide', 'kill myself', 'end it all', 'self-harm', 'self harm', 'want to die',
  'end my life', 'no reason to live', 'better off dead', 'hurt myself',
  'hopeless', 'can\'t go on', "can't go on", 'don\'t want to be here',
  // Kiswahili
  'kujiua', 'nitajiuwa', 'nataka kufa', 'nataka kujiua', 'maisha yameniboa',
  'siwezi tena', 'nimechoka na maisha', 'kufa better',
  // Sheng / Kenyan slang
  'niacha dunia', 'niko tayari kufa', 'njoo kifo', 'tumia dawa nyingi',
  // misspellings / variants
  'suicidal', 'killmyself', 'enditall', 'selfharm',
]

export function normalizeCrisisText(message) {
  return String(message || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectCrisis(message) {
  const normalized = normalizeCrisisText(message)
  if (!normalized) return { crisis: false, keywords: [] }
  const matched = CRISIS_KEYWORDS.filter((keyword) => {
    const k = normalizeCrisisText(keyword)
    return normalized.includes(k)
  })
  return { crisis: matched.length > 0, keywords: matched }
}

export function crisisKeywordsOnly(message) {
  return detectCrisis(message).keywords
}
