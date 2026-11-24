/* global process */
import { fetchWithTimeout } from './oloo/server.js'
import { crisisReply } from '../../src/lib/crisisSupport.js'

export async function crisisOutcome(auth, message, triage, source = 'chat') {
  let alertRecorded = false
  // Only a direct disclosure follows the existing, authenticated escalation path.
  // Third-person guidance and a PGSI result alone must never create an alert.
  if (triage.target === 'self' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      const response = await fetchWithTimeout(`${auth.supabaseUrl}/rest/v1/rpc/record_crisis_event`, {
        method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: auth.user.id, p_context: message.slice(0, 500), p_keywords: triage.keywords, p_source: source, p_max_sessions: 1 }),
      }, 10000)
      const id = response.ok ? await response.json().catch(() => null) : null
      alertRecorded = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    } catch { /* Urgent guidance is independent of escalation availability. No sensitive logs. */ }
  }
  return { reply: crisisReply(triage.target), crisis: { target: triage.target, urgent: triage.urgent }, alertRecorded }
}
