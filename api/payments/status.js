/* global process */

import { createClient } from '@supabase/supabase-js'

function json(res, status, body) {
  res.status(status).json(body)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return json(res, 401, { error: 'Unauthorized' })

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return json(res, 401, { error: 'Unauthorized' })

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('status, must_change_password')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('payments/status account status lookup failed', profileError)
    return json(res, 503, { error: 'Account access could not be verified' })
  }
  if (!profile || profile.status === 'suspended' || profile.must_change_password) {
    return json(res, 403, { error: 'Account access is restricted' })
  }

  const reference = req.query?.reference
  let query = db.from('payments').select('id, status, amount, currency, plan, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1)
  if (reference) query = query.eq('provider_ref', reference)
  const { data } = await query.maybeSingle()
  if (!data) return json(res, 404, { error: 'No payment found' })
  return json(res, 200, data)
}
