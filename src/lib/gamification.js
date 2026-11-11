import { supabase } from './supabase'

// Server-authoritative progress recompute (streak, money saved, badges,
// clean_since, streak freeze). Replaces all direct client writes to those
// privileged profile columns.
export async function recomputeProgress() {
  const { data, error } = await supabase.rpc('recompute_progress')
  if (error) {
    console.error('recompute_progress failed:', error)
    return null
  }
  return data
}

// ─── Check and award badges ───
// Badge evaluation now happens inside recompute_progress(); this helper
// recomputes and returns details for newly earned badges only.
export async function checkBadges(userId) {
  if (!userId) return []

  const result = await recomputeProgress()
  const newIds = result?.new_badges || []
  if (!Array.isArray(newIds) || newIds.length === 0) return []

  const { data: badgeDetails, error } = await supabase
    .from('badges')
    .select('*')
    .in('id', newIds)

  if (error) {
    console.error('Badge details error:', error)
    return []
  }
  return badgeDetails || []
}
