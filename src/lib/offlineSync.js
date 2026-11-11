import { supabase } from './supabase'
import {
  listOfflineItems,
  removeOfflineItem,
  markOfflineItemAttempt,
  onOfflineQueueChange,
} from './offlineQueue'

async function syncDiaryEntry(item) {
  const { payload } = item
  const today = payload.date || new Date().toISOString().split('T')[0]
  const { data: existing } = await supabase
    .from('diary_entries')
    .select('id')
    .eq('user_id', payload.user_id)
    .eq('date', today)
    .maybeSingle()

  const write = existing
    ? supabase.from('diary_entries').update(payload).eq('id', existing.id)
    : supabase.from('diary_entries').insert(payload)

  const { error } = await write
  if (error) throw error

  const { recomputeProgress } = await import('./gamification')
  await recomputeProgress()
}

async function syncUrgeSession(item) {
  const { payload } = item
  const { error } = await supabase.from('urge_toolkit_sessions').insert(payload)
  if (error) throw error
}

async function syncUrgeChallenge(item) {
  const { payload } = item
  const { error } = payload.id
    ? await supabase.from('urge_challenges').update(payload).eq('id', payload.id)
    : await supabase.from('urge_challenges').insert(payload)
  if (error) throw error
}

const SYNCERS = {
  diary_entry: syncDiaryEntry,
  urge_session: syncUrgeSession,
  urge_challenge: syncUrgeChallenge,
}

export async function syncOfflineQueue() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 }
  const items = await listOfflineItems()
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
  const run = () => { void syncOfflineQueue() }
  const unsubscribe = onOfflineQueueChange(run)
  const interval = window.setInterval(run, 60000)
  run()
  return () => {
    unsubscribe()
    window.clearInterval(interval)
  }
}
