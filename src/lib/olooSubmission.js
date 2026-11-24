import { detectCrisis } from './crisisDetection.js'
import { crisisReply, publishCrisisSupport } from './crisisSupport.js'

// The actual widget uses this route. Safety UI is published synchronously before
// any network request, consent lookup, quota check, or AI-provider call.
export async function submitOlooMessage(message, { ask, report, onImmediateReply = () => {}, publish = publishCrisisSupport }) {
  const triage = detectCrisis(message)
  if (!triage.crisis) return ask(message)
  const requestId = crypto.randomUUID()
  const reply = crisisReply(triage.target)
  publish({ requestId, target: triage.target, open: true, escalation: triage.target === 'self' ? 'pending' : 'not_requested' })
  onImmediateReply({ reply, triage })
  let escalation = 'not_requested'
  if (triage.target === 'self') {
    try { const outcome = await report(message); escalation = outcome?.alertRecorded === true ? 'recorded' : 'unavailable' }
    catch { escalation = 'unavailable' }
    publish({ requestId, target: triage.target, open: false, escalation })
  }
  return { reply, crisis: triage, escalation }
}