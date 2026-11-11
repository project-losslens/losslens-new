import { createClient } from '@supabase/supabase-js'

//  Daily subscription expiry sweep. Call with a cron (Vercel Cron or any
//  scheduler) using CRON_SECRET as a bearer token. Uses the service role:
//  no SQL function or pg_cron required. Each expiry writes an audit_logs row
//  so the change appears in subscription history. The client entitlement
//  check also treats expired plans as free, so this is a belt-and-braces
//  tidy-up even if the cron is not enabled.
//  Enable in vercel.json under "crons" — see docs/MIGRATION_NOTES.md.

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization || ''
  // Vercel Cron cannot set headers, so it also accepts ?secret= matching
  // CRON_SECRET. Prefer the bearer header for external schedulers.
  const querySecret = req.query?.secret
  const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret)
  if (!ok) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: expired, error } = await db
    .from('profiles')
    .select('id, subscription_plan, subscription_status, subscription_expires_at, plan_type')
    .not('subscription_expires_at', 'is', null)
    .lte('subscription_expires_at', new Date().toISOString())
    .not('subscription_status', 'in', '("expired","cancelled")')
  if (error) {
    console.error('expire-subscriptions query failed', error)
    return res.status(500).json({ error: error.message })
  }

  let count = 0
  for (const row of expired || []) {
    const { error: updateError } = await db.from('profiles')
      .update({ subscription_status: 'expired' })
      .eq('id', row.id)
    if (updateError) {
      console.error('expire-subscriptions update failed', row.id, updateError)
      continue
    }
    await db.from('audit_logs').insert({
      actor_id: null,
      action: 'subscription_change',
      target_table: 'profiles',
      target_id: row.id,
      metadata: {
        old_plan: row.subscription_plan,
        new_plan: row.subscription_plan,
        old_status: row.subscription_status,
        new_status: 'expired',
        reason: 'Subscription expired',
        source: 'system',
      },
    })
    count += 1
  }
  return res.status(200).json({ expired: count })
}
