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

  // Success: mark payment + activate plan via the same privileged path.
  await db.from('payments').update({
    status: 'success',
    reference: mpesaReceipt || merchantRequestId || payment.reference,
    raw: { ...(payment.raw || {}), resultCode, merchantRequestId, mpesaReceipt, phone },
    updated_at: new Date().toISOString(),
  }).eq('id', payment.id)

  const { error: rpcError } = await db.rpc('admin_set_subscription', {
    p_user_id: payment.user_id,
    p_plan: payment.plan || 'premium',
    p_status: 'active',
    p_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    p_plan_type: null,
    p_reason: `M-Pesa payment ${mpesaReceipt || merchantRequestId || ''}`.trim(),
  }).catch(() => ({ error: 'rpc_failed' }))
  // admin_set_subscription requires a super_admin caller; service role bypasses
  // is_super_admin() only if the function checks auth — so write directly here
  // instead when the RPC rejects.
  if (rpcError) {
    await db.from('profiles').update({
      subscription_plan: payment.plan || 'premium',
      subscription_status: 'active',
      subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    }).eq('id', payment.user_id)
    await db.from('subscription_events').insert({
      user_id: payment.user_id,
      changed_by: null,
      new_plan: payment.plan || 'premium',
      new_status: 'active',
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      reason: `M-Pesa payment ${mpesaReceipt || merchantRequestId || ''}`.trim(),
      source: 'payment',
    })
  }

  return json(res, 200, { ok: true, status: 'success' })
}
