import { paymentsMode } from '../_lib/payments.js'

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const amount = Number(process.env.PREMIUM_PRICE_KES)
  const configured = Number.isSafeInteger(amount) && amount > 0
  const mode = paymentsMode()
  return res.status(200).json({
    available: configured && mode !== 'off',
    amount: configured ? amount : null,
    currency: 'KES',
  })
}
