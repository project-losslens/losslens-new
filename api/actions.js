/* global process */

// POST /api/actions — executes an Oloo-proposed action after the user's
// explicit in-chat confirmation. Read actions may also run here so the client
// can refresh results. All execution uses the caller's JWT (RLS applies).

import { getAuthenticatedUser, actionContext, json } from './_lib/oloo/server.js'
import { getAction } from './_lib/oloo/actions.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Method not allowed' })
  }
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(response, 500, { error: 'action pipeline not configured' })
    }
    const auth = await getAuthenticatedUser(request)
    if (!auth) return json(response, 401, { error: 'unauthorized' })

    let body = request.body || {}
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { return json(response, 400, { error: 'invalid_body' }) }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.action !== 'string' || body.action.length > 80) {
      return json(response, 400, { error: 'A valid action is required' })
    }

    const def = getAction(body.action)
    if (!def) return json(response, 400, { error: 'Unknown action' })

    // Consequential actions require the client's explicit confirmation flag —
    // the UI only sends it after the user taps Confirm.
    if (def.confirm && body.confirmed !== true) {
      return json(response, 400, { error: 'Confirmation required' })
    }

    const params = body.params && typeof body.params === 'object' && !Array.isArray(body.params)
      ? body.params : {}

    const result = await def.run(actionContext(auth), params)
    if (!result?.ok) {
      return json(response, 200, {
        ok: false,
        error: typeof result?.error === 'string' ? result.error.slice(0, 300) : 'Action failed',
      })
    }
    return json(response, 200, {
      ok: true,
      summary: typeof result.summary === 'string' ? result.summary.slice(0, 600) : null,
      data: result.data ?? null,
    })
  } catch (error) {
    console.error('Oloo action failed:', error?.message || error)
    return json(response, 500, { error: 'Action could not be completed' })
  }
}
