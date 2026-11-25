import { paymentsMode, queryMpesaStkStatus } from '../_lib/payments.js'
import { createClient } from '@supabase/supabase-js'

function json(res, status, body) {
  res.status(status).json(body)
}

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

// Daraja callbacks are not signed. Verify successful callbacks against Daraja
// before making the atomic, idempotent entitlement change in the database.
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  const mode = paymentsMode()
  if (mode !== 'live') return json(res, 200, { ok: true, ignored: mode })

  const db = adminClient()
  const cb = req.body?.Body?.stkCallback || req.body?.stkCallback || {}
  const items = cb.CallbackMetadata?.Item || []
  const get = (name) => items.find(i => i.Name === name)?.Value
  const checkoutRequestId = cb.CheckoutRequestID
  const merchantRequestId = cb.MerchantRequestID
  if (typeof checkoutRequestId !== 'string' || typeof merchantRequestId !== 'string') {
    return json(res, 400, { error: 'Invalid callback identifiers' })
  }

  // Find the pending payment by checkout request id stored in raw.
  const { data: payment, error: lookupError } = await db
    .from('payments')
    .select('id, provider_ref, raw')
    .eq('status', 'pending')
    .eq('provider', 'mpesa')
    .filter('raw->>checkoutRequestId', 'eq', checkoutRequestId)
    .maybeSingle()

  if (lookupError) {
    console.error('M-Pesa callback payment lookup failed', lookupError)
    return json(res, 503, { error: 'Payment verification is temporarily unavailable' })
  }
  if (!payment) {
    // Idempotent: already processed or unknown — acknowledge anyway.
    return json(res, 200, { ok: true, matched: false })
  }

  const expectedMerchantRequestId = payment.raw?.merchantRequestId
  if (!expectedMerchantRequestId || merchantRequestId !== expectedMerchantRequestId) {
    console.warn('M-Pesa callback identifiers did not match the stored request', { paymentId: payment.id })
    return json(res, 200, { ok: true, matched: false })
  }

  let verification
  try {
    verification = await queryMpesaStkStatus(checkoutRequestId)
  } catch (error) {
    console.error('M-Pesa transaction status query failed', error)
    return json(res, 503, { error: 'Payment verification is temporarily unavailable' })
  }

  if (verification.CheckoutRequestID !== checkoutRequestId
      || verification.MerchantRequestID !== expectedMerchantRequestId) {
    return json(res, 503, { error: 'Payment identifiers could not be verified' })
  }
  if (String(verification.ResultCode) !== '0') {
    if (verification.ResultCode == null) return json(res, 503, { error: 'Payment confirmation is pending' })
    const { error } = await db.from('payments').update({ status: 'failed', raw: { ...payment.raw, providerResultCode: String(verification.ResultCode), providerOutcomeVerified: true } })
      .eq('id', payment.id).eq('status', 'pending')
    if (error) return json(res, 503, { error: 'Payment outcome could not be recorded' })
    return json(res, 200, { ok: true, status: 'failed' })
  }

  const { data, error } = await db.rpc('service_confirm_mpesa_payment', {
    p_checkout_request_id: checkoutRequestId,
    p_merchant_request_id: expectedMerchantRequestId,
    p_callback_receipt: get('MpesaReceiptNumber') || null,
  })
  if (error) {
    console.error('M-Pesa payment confirmation RPC failed', error)
    return json(res, 503, { error: 'Payment activation is temporarily unavailable' })
  }
  return json(res, 200, { ok: true, status: data?.status || 'processed' })
}
