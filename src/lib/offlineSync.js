import { recoveryDate } from './calendar'
import { supabase } from './supabase'
import {
  listOfflineItems,
  removeOfflineItem,
  markOfflineItemAttempt,
  onOfflineQueueChange,
} from './offlineQueue'

async function syncDiaryEntry(item) {
  const { payload } = item
  const today = payload.date || recoveryDate()
  const { data: existing, error: lookupError } = await supabase
    .from('diary_entries')
    .select('id')
    .eq('user_id', payload.user_id)
    .eq('date', today)
    .maybeSingle()

  if (lookupError) throw lookupError
  const write = existing
    ? supabase.from('diary_entries').update(payload).eq('id', existing.id)
    : supabase.from('diary_entries').upsert(payload, { onConflict: 'user_id,date' })

  const { error } = await write.select('id').single()
  if (error) throw error

  const { recomputeProgress } = await import('./gamification')
  await recomputeProgress()
}

async function syncUrgeSession(item) {
  const { payload } = item
  const { data, error } = await supabase.from('urge_toolkit_sessions').upsert(payload, { onConflict: 'id' }).select('id').single()
  if (error || !data?.id) throw error || new Error('Offline write was not confirmed')
}

async function syncUrgeChallenge(item) {
  const { payload } = item
  const { data, error } = await supabase.from('urge_challenges').upsert(payload, { onConflict: 'id' }).select('id').single()
  if (error || !data?.id) throw error || new Error('Offline write was not confirmed')
}

const SYNCERS = {
  diary_entry: syncDiaryEntry,
  urge_session: syncUrgeSession,
  urge_challenge: syncUrgeChallenge,
}

let syncPromise = null

export function syncOfflineQueue() {
  if (syncPromise) return syncPromise
  syncPromise = runSync().finally(() => { syncPromise = null })
  return syncPromise
}

async function runSync() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, failed: 0 }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { synced: 0, failed: 0 }
  const items = (await listOfflineItems()).filter(item => item.payload?.user_id === session.user.id)
  let synced = 0
  let failed = 0
  for (const item of items) {
    const syncer = SYNCERS[item.kind]
    if (!syncer) {
      await removeOfflineItem(item.id)
      continue
    }
    try {
      await syncer(item)
      await removeOfflineItem(item.id)
      synced += 1
    } catch (error) {
      console.error('Offline queue sync failed for', item.kind, error)
      await markOfflineItemAttempt(item.id)
      failed += 1
      // Stop on the first failure to preserve ordering.
      break
    }
  }
  return { synced, failed }
}

export function startOfflineSync() {
  if (typeof window === 'undefined') return () => {}
  const run = () => { void syncOfflineQueue().catch(error => console.error('Offline sync unavailable:', error?.message)) }
  const unsubscribe = onOfflineQueueChange(run)
  const interval = window.setInterval(run, 60000)
  run()
  return () => {
    unsubscribe()
    window.clearInterval(interval)
  }
}
