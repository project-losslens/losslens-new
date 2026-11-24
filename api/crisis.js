import { detectCrisis } from '../src/lib/crisisDetection.js'
import { getAuthenticatedUser, json } from './_lib/oloo/server.js'
import { crisisOutcome } from './_lib/crisis.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { error: 'Method not allowed' }) }
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) return json(response, 401, { error: 'Unauthorized' })
    let body = request.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return json(response, 400, { error: 'Invalid request' }) } }
    if (!body || Array.isArray(body) || typeof body.message !== 'string' || Object.keys(body).some(key => !['message', 'source'].includes(key))
      || (body.source != null && !['chat', 'diary'].includes(body.source))) return json(response, 400, { error: 'A valid message is required' })
    const message = body.message.trim().slice(0, 4000)
    const triage = detectCrisis(message)
    if (!triage.crisis) return json(response, 200, { crisis: false, alertRecorded: false })
    const outcome = await crisisOutcome(auth, message, triage, body.source || 'diary')
    return json(response, 200, outcome)
  } catch { return json(response, 503, { error: 'Escalation could not be confirmed', alertRecorded: false }) }
}