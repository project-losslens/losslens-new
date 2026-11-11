// Client-side mirror of the crisis keyword detector used by api/chat.js.
// Keep CRISIS_KEYWORDS and normalisation in sync with the server copy —
// the authoritative detection runs server-side before the model is called.

import { primaryHelpline } from '../config/helplines.js'

export const CRISIS_HELPLINE = `${primaryHelpline.name}: ${primaryHelpline.phone} (free, confidential)`

const CRISIS_KEYWORDS = [
  // English
  'suicide', 'kill myself', 'end it all', 'self-harm', 'self harm', 'want to die',
  'end my life', 'no reason to live', 'better off dead', 'hurt myself',
  'can\'t go on', "can't go on", 'don\'t want to be here',
  // Kiswahili
  'kujiua', 'nitajiuwa', 'nataka kufa', 'nataka kujiua', 'maisha yameniboa',
  'sina sababu ya kuishi', 'nimechoka kabisa', 'nimechoka na maisha', 'kufa better',
  "i don't want to be here anymore",
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
