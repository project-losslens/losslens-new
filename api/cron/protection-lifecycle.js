import { createClient } from '@supabase/supabase-js'

//  Daily Protection policy-lifecycle sweep: recomputes premium_status and
//  moves policies issued -> active -> grace -> lapsed/expired based on the
//  insurer-confirmed premium ledger. Call with CRON_SECRET (bearer or
//  ?secret=). Enable in vercel.json under "crons".

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization || ''
  const querySecret = req.query?.secret
  const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret)
  if (!ok) return res.status(401).json({ error: 'Unauthorized' })

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await db.rpc('protection_lifecycle_sweep')
  if (error) {
    console.error('protection-lifecycle-sweep failed', error)
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ ok: true, policies_checked: data })
}
