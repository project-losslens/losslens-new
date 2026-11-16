/* global process */

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

  const db = adminClient()
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('status, must_change_password')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('payments/start account status lookup failed', profileError)
    return json(res, 503, { error: 'Account access could not be verified' })
  }
  if (!profile || profile.status === 'suspended' || profile.must_change_password) {
    return json(res, 403, { error: 'Account access is restricted' })
  }

  const { phone, plan = 'premium' } = req.body || {}
  if (plan !== 'premium') return json(res, 400, { error: 'Only Premium is self-serve' })

  try {
    const amount = Number(process.env.PREMIUM_PRICE_KES)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return json(res, 503, { error: 'Premium payment amount is not configured correctly' })
    }
    const result = await startPremiumPayment({
      userId: user.id,
      phone,
      amount,
      accountRef: `LL-${user.id.slice(0, 8)}`,
    })
    if (!result.started) return json(res, 200, { mode, started: false })

    const simulated = Boolean(result.simulated)
    const { data: payment, error } = await db.from('payments').insert({
      user_id: user.id,
      provider: mode === 'sandbox' ? 'sandbox' : 'mpesa',
      provider_ref: result.reference || null,
      amount,
      currency: 'KES',
      plan,
      status: simulated ? 'success' : 'pending',
      raw: {
        checkoutRequestId: result.checkoutRequestId || null,
        merchantRequestId: result.merchantRequestId || null,
      },
    }).select().single()
    if (error) {
      console.error('payments/start ledger insert error', error)
      return json(res, 502, { error: 'Payment started but could not be recorded. Contact support before retrying.' })
    }

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
