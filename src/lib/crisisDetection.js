import { primaryHelpline } from '../config/helplines.js'
export const CRISIS_HELPLINE = `${primaryHelpline.name}: ${primaryHelpline.phone}`

export function normalizeCrisisText(message) {
  return String(message || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
const SELF_ACT = '(?:kill(?:ing)?|kil(?:ing)?|hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?)\\s*(?:my\\s*self|myself|myslef|mysef)'
const SUICIDE = '(?:suicid(?:e|al|ial|ality)|suicdal|sucidal|suicidle)'
const risk = new RegExp(`\\b(?:${SELF_ACT}|${SUICIDE}|(?:end|ending) (?:my life|it all)|(?:want|wanna|wish) to (?:die|be dead)|(?:dont|do not) want to (?:live|be alive)|better off dead|no reason to live|kujiua|kujiumiza|kujinyonga|nitajiua|nitajiuwa|nataka kufa|niko tayari kufa|kumaliza maisha yangu|(?:kill(?:ing)?|hurt(?:ing)?) (?:themself|themselves|himself|herself)|(?:end|ending) (?:her|his|their) life)\\b`, 'g')
const negated = new RegExp(`\\b(?:(?:not|never|no longer|isnt|arent|wasnt) (?:currently |feeling |at all )?${SUICIDE}|(?:dont|do not|doesnt|does not|never) (?:want to |think about |think of |have thoughts of )(?:${SELF_ACT}|die|${SUICIDE})|not (?:currently )?(?:thinking (?:about|of)|planning (?:on|to)|going to) (?:${SELF_ACT}|suicide)|(?:sina mawazo ya|sitaki|sifikirii) (?:kujiua|kujiumiza|kufa))\\b`, 'g')
const thirdPerson = /\b(?:my|a|our|his|her|their) (?:friend|partner|brother|sister|mother|father|son|daughter|wife|husband|child)|\b(?:she|he|they) (?:is|are|wants?|said|says|feels?|was|were|thinking)|\b(?:rafiki|ndugu|mama|baba) yangu\b/
const directSelf = new RegExp(`\\b(?:i|im|i am) (?:really |now |currently )?(?:want|wanna|am thinking|thinking|plan|intend|will|might|feel|have thoughts)|${SELF_ACT}|\\b(?:nataka|nafikiria|ninafikiria|nitajiua|nitajiuwa)\\b`)

// Clause-level contextual triage shared by browser and server. This is not a diagnosis.
// Negated spans are removed individually; they cannot cancel a separate disclosure.
export function detectCrisis(message) {
  const clauses = String(message || '').split(/[.!?;\n]+|\b(?:but|however|and|lakini)\b/i)
  let other = null
  for (const original of clauses) {
    const text = normalizeCrisisText(original).replace(negated, ' ')
    risk.lastIndex = 0
    const matches = Array.from(text.matchAll(risk), match => match[0])
    if (!matches.length) continue
    const third = thirdPerson.test(text)
    const self = directSelf.test(text)
    if (/\b(?:what is|what does|meaning of|article about|research about|news about)\b/.test(text) && !self && !third) continue
    if (/\b(?:used to|last year|years ago|in the past)\b/.test(text) && !/\b(?:now|today|tonight|again)\b/.test(text)) continue
    if (third) { other = { crisis: true, target: 'other', urgent: false, keywords: matches }; continue }
    return { crisis: true, target: 'self', urgent: true, keywords: matches }
  }
  return other || { crisis: false, target: 'none', urgent: false, keywords: [] }
}