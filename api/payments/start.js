import { paymentsMode, startPremiumPayment } from '../_lib/payments.js'
import { createClient } from '@supabase/supabase-js'

function json(res, status, body) {
  res.status(status).json(body)
}

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  const mode = paymentsMode()
  if (mode === 'off') return json(res, 200, { mode, started: false })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return json(res, 401, { error: 'Unauthorized' })

  const { data: { user }, error: authError } = await adminClient().auth.getUser(token)
  if (authError || !user) return json(res, 401, { error: 'Unauthorized' })

  const { phone, plan = 'premium' } = req.body || {}
  if (plan !== 'premium') return json(res, 400, { error: 'Only Premium is self-serve' })

  try {
    const amount = Number(process.env.PREMIUM_PRICE_KES || 500)
    const result = await startPremiumPayment({
      userId: user.id,
      phone,
      amount,
      accountRef: `LL-${user.id.slice(0, 8)}`,
    })
    if (!result.started) return json(res, 200, { mode, started: false })

    const db = adminClient()
    const simulated = Boolean(result.simulated)
    const { data: payment } = await db.from('payments').insert({
      user_id: user.id,
      provider: mode === 'sandbox' ? 'sandbox' : 'mpesa',
      provider_ref: result.reference || null,
      amount,
      currency: 'KES',
      plan,
      status: simulated ? 'success' : 'pending',
      raw: { checkoutRequestId: result.checkoutRequestId || null },
    }).select().single()

    if (simulated) {
      const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
      await db.from('profiles').update({
        subscription_plan: plan,
        subscription_status: 'active',
        subscription_expires_at: expiresAt,
      }).eq('id', user.id)
      await db.from('audit_logs').insert({
        actor_id: null,
        action: 'subscription_change',
        target_table: 'profiles',
        target_id: user.id,
        metadata: {
          new_plan: plan,
          new_status: 'active',
          new_expires_at: expiresAt,
          reason: 'Sandbox payment',
          source: 'payment',
        },
      })
    }
    return json(res, 200, { ...result, amount, paymentId: payment?.id || null })
  } catch (err) {
    console.error('payments/start error', err)
    return json(res, 502, { error: err.message || 'Payment could not be started' })
  }
}
