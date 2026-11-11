import { createClient } from '@supabase/supabase-js'

//  Daily subscription expiry sweep. Call with a cron (Vercel Cron, pg_cron
//  via pg_net, or any scheduler) using CRON_SECRET as a bearer token.
//  Alternative: run public.expire_subscriptions() via pg_cron directly —
//  see docs/MIGRATION_NOTES.md.

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await db.rpc('expire_subscriptions')
  if (error) {
    console.error('expire_subscriptions failed', error)
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ expired: data ?? 0 })
}
