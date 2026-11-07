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

// ─── Get all earned badges ───
export async function getEarnedBadges(userId) {
  if (!userId) return []

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('badges')
    .eq('id', userId)
    .single()

  if (profileError || !profile?.badges || profile.badges.length === 0) {
    if (profileError) console.error('Earned badges fetch error:', profileError)
    return []
  }

  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .in('id', profile.badges)

  if (error) {
    console.error('Badge details error:', error)
    return []
  }

  return data || []
}

// ─── Get all available badges with earned status ───
export async function getAllBadges(userId) {
  const { data: allBadges, error: allError } = await supabase
    .from('badges')
    .select('*')
    .order('category')

  if (allError) {
    console.error('All badges fetch error:', allError)
    return []
  }

  if (!userId) return allBadges || []

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('badges')
    .eq('id', userId)
    .single()

  if (profileError) console.error('Profile badges error:', profileError)

  const earned = profile?.badges || []

  return (allBadges || []).map(badge => ({
    ...badge,
    earned: earned.includes(badge.id),
  }))
}

// ─── Streak Freeze ───
// The freeze is now consumed automatically by recompute_progress() when a
// gambling day would break the streak. These helpers only READ state.
export async function checkStreakFreeze(userId) {
  if (!userId) return false

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('streak_freeze_used, streak_freeze_reset_date')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    if (error) console.error('Streak freeze check error:', error)
    return false
  }

  const resetDate = profile.streak_freeze_reset_date
  const today = new Date().toISOString().split('T')[0]

  if (resetDate && resetDate <= today) return true
  return !profile.streak_freeze_used
}

// Kept for call-site compatibility. The freeze is applied server-side by
// recompute_progress(); calling this simply recomputes progress.
export async function useStreakFreeze(userId) {
  if (!userId) return false
  const result = await recomputeProgress()
  return Boolean(result)
}
