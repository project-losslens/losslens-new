//  Payments adapter — Premium only (insurance/Protection is handled
//  separately). Modes: off | sandbox | live (default off).
//  Live mode uses M-Pesa Daraja STK push; sandbox simulates success.

export function paymentsMode() {
  const mode = (process.env.PAYMENTS_MODE || 'off').toLowerCase()
  return ['off', 'sandbox', 'live'].includes(mode) ? mode : 'off'
}

const SANDBOX_PHONE = /^\+?2547\d{8}$|^0?7\d{8}$/

function normalizeKenyanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return '254' + digits.slice(1)
  if (digits.length === 9) return '254' + digits
  return null
}

//  Daraja STK push (live mode). Returns { reference, checkoutRequestId }.
async function mpesaStkPush({ phone, amount, accountRef, description }) {
  const base = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
  const consumerKey = process.env.MPESA_CONSUMER_KEY
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET
  const businessShortCode = process.env.MPESA_BUSINESS_SHORT_CODE
  const passkey = process.env.MPESA_PASSKEY
  const callbackUrl = process.env.MPESA_CALLBACK_URL
  if (!consumerKey || !consumerSecret || !businessShortCode || !passkey || !callbackUrl) {
    throw new Error('M-Pesa credentials are not configured')
  }
  const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64') },
  })
  const { access_token } = await tokenRes.json()
  if (!access_token) throw new Error('M-Pesa auth failed')

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64')
  const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: normalizeKenyanPhone(phone),
      PartyB: businessShortCode,
      PhoneNumber: normalizeKenyanPhone(phone),
      CallBackURL: callbackUrl,
      AccountReference: accountRef,
      TransactionDesc: description,
    }),
  })
  const stk = await stkRes.json()
  if (stk.ResponseCode !== '0') throw new Error(stk.errorMessage || 'STK push failed')
  return { reference: stk.MerchantRequestID || stk.CheckoutRequestID, checkoutRequestId: stk.CheckoutRequestID }
}

//  Start a Premium purchase. Returns { reference, mode, simulated }.
export async function startPremiumPayment({ userId, phone, amount, accountRef }) {
  const mode = paymentsMode()
  if (mode === 'off') return { mode, simulated: false, started: false }
  const normalized = normalizeKenyanPhone(phone)
  if (!normalized || !SANDBOX_PHONE.test(normalized)) {
    throw new Error('Enter a valid Kenyan mobile number (07XX or +2547XX)')
  }
  if (mode === 'sandbox') {
    return { mode, simulated: true, started: true, reference: `SANDBOX-${Date.now()}` }
  }
  const result = await mpesaStkPush({
    phone: normalized,
    amount,
    accountRef: accountRef || `LL-${String(userId).slice(0, 8)}`,
    description: 'LossLens Premium',
  })
  return { mode, simulated: false, started: true, ...result }
}
