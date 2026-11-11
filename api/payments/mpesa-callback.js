import { paymentsMode } from '../../_lib/payments.js'
import { createClient } from '@supabase/supabase-js'

function json(res, status, body) {
  res.status(status).json(body)
}

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

//  M-Pesa Daraja callback. Idempotent: keyed on MerchantRequestID/CheckoutRequestID.
//  Verifies amount and reference before activating the plan.
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  const mode = paymentsMode()
  if (mode !== 'live') return json(res, 200, { ok: true, ignored: mode })

  const db = adminClient()
  const cb = req.body?.Body?.stkCallback || req.body?.stkCallback || {}
  const items = cb.CallbackMetadata?.Item || []
  const get = (name) => items.find(i => i.Name === name)?.Value
  const resultCode = cb.ResultCode
  const checkoutRequestId = cb.CheckoutRequestID
  const merchantRequestId = cb.MerchantRequestID
  const amount = Number(get('Amount') ?? 0)
  const mpesaReceipt = get('MpesaReceiptNumber')
  const phone = get('PhoneNumber')

  // Find the pending payment by checkout request id stored in raw.
  const { data: payment } = await db
    .from('payments')
    .select('*')
    .eq('status', 'pending')
    .eq('provider', 'mpesa')
    .filter('raw->>checkoutRequestId', 'eq', checkoutRequestId)
    .maybeSingle()

  if (!payment) {
    // Idempotent: already processed or unknown — acknowledge anyway.
    return json(res, 200, { ok: true, matched: false })
  }

  if (resultCode !== 0) {
    await db.from('payments').update({
      status: 'failed',
      raw: { ...(payment.raw || {}), resultCode, merchantRequestId },
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id)
    return json(res, 200, { ok: true, status: 'failed' })
  }

  const expected = Number(payment.amount)
  if (amount !== expected) {
    await db.from('payments').update({
      status: 'failed',
      raw: { ...(payment.raw || {}), resultCode, merchantRequestId, amountMismatch: { expected, got: amount } },
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id)
    return json(res, 200, { ok: true, status: 'failed', reason: 'amount_mismatch' })
  }

  // Success: mark payment + activate plan server-side (service role bypasses
  // the privileged-fields trigger; same fields admin_set_subscription writes).
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  const reason = `M-Pesa payment ${mpesaReceipt || merchantRequestId || ''}`.trim()
  await db.from('payments').update({
    status: 'success',
    provider_ref: mpesaReceipt || merchantRequestId || payment.provider_ref,
    raw: { ...(payment.raw || {}), resultCode, merchantRequestId, mpesaReceipt, phone },
    updated_at: new Date().toISOString(),
  }).eq('id', payment.id)

  const { data: before } = await db.from('profiles')
    .select('subscription_plan, subscription_status, subscription_expires_at')
    .eq('id', payment.user_id).maybeSingle()
  await db.from('profiles').update({
    subscription_plan: payment.plan || 'premium',
    subscription_status: 'active',
    subscription_expires_at: expiresAt,
  }).eq('id', payment.user_id)
  await db.from('audit_logs').insert({
    actor_id: null,
    action: 'subscription_change',
    target_table: 'profiles',
    target_id: payment.user_id,
    metadata: {
      old_plan: before?.subscription_plan || null,
      new_plan: payment.plan || 'premium',
      old_status: before?.subscription_status || null,
      new_status: 'active',
      new_expires_at: expiresAt,
      reason,
      source: 'payment',
    },
  })

  return json(res, 200, { ok: true, status: 'success' })
}
