import { supabase } from './supabase'

// â”€â”€â”€ Check and award badges â”€â”€â”€
export async function checkBadges(userId) {
  if (!userId) return []

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('badges, streak_days, money_saved')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError)
    return []
  }

  const earnedBadges = profile.badges || []
  const newBadges = []

  // Get diary count
  const { count: diaryCount, error: diaryError } = await supabase
    .from('diary_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (diaryError) console.error('Diary count error:', diaryError)

  // Get clean days count
  const { count: cleanDays, error: cleanError } = await supabase
    .from('diary_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('gambled', false)

  if (cleanError) console.error('Clean days error:', cleanError)

  // Get CBT count
  const { count: cbtCount, error: cbtError } = await supabase
    .from('cbt_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completed', true)

  if (cbtError) console.error('CBT count error:', cbtError)

  // Get unique triggers count
  const { data: entries, error: entriesError } = await supabase
    .from('diary_entries')
    .select('triggers')
    .eq('user_id', userId)

  if (entriesError) console.error('Entries fetch error:', entriesError)

  const allTriggers = new Set()
  ;(entries || []).forEach(e => {
    (e.triggers || []).forEach(t => allTriggers.add(t))
  })

  // Check each badge
  const badgeChecks = [
    { id: 'first_entry', condition: (diaryCount || 0) >= 1 },
    { id: 'week_streak', condition: (profile.streak_days || 0) >= 7 },
    { id: 'month_streak', condition: (profile.streak_days || 0) >= 30 },
    { id: 'diary_10', condition: (diaryCount || 0) >= 10 },
    { id: 'diary_30', condition: (diaryCount || 0) >= 30 },
    { id: 'cbt_1', condition: (cbtCount || 0) >= 1 },
    { id: 'cbt_4', condition: (cbtCount || 0) >= 4 },
    { id: 'cbt_all', condition: (cbtCount || 0) >= 8 },
    { id: 'first_no', condition: (cleanDays || 0) >= 1 },
    { id: 'trigger_master', condition: allTriggers.size >= 5 },
    { id: 'saved_1000', condition: (profile.money_saved || 0) >= 1000 },
    { id: 'saved_10000', condition: (profile.money_saved || 0) >= 10000 },
  ]

  for (const check of badgeChecks) {
    if (check.condition && !earnedBadges.includes(check.id)) {
      newBadges.push(check.id)
      earnedBadges.push(check.id)
    }
  }

  // Save new badges
  if (newBadges.length > 0) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ badges: earnedBadges })
      .eq('id', userId)

    if (updateError) {
      console.error('Badge save error:', updateError)
      return []
    }

    // Award recovery coins
    const { data: allBadges, error: badgeFetchError } = await supabase
      .from('badges')
      .select('id')
      .in('id', newBadges)

    if (badgeFetchError) console.error('Badge fetch error:', badgeFetchError)

    const coinsEarned = newBadges.length * 10
    const { error: coinError } = await supabase.rpc('add_recovery_coins', {
      uid: userId,
      amount: coinsEarned
    })

    if (coinError) console.error('Coin award error:', coinError)
  }

  // Fetch badge details
  const { data: badgeDetails, error: detailsError } = await supabase
    .from('badges')
    .select('*')
    .in('id', newBadges.length > 0 ? newBadges : ['none'])

  if (detailsError) console.error('Badge details error:', detailsError)

  return badgeDetails || []
}

// â”€â”€â”€ Get all earned badges â”€â”€â”€
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

// â”€â”€â”€ Get all available badges with earned status â”€â”€â”€
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

// â”€â”€â”€ Streak Freeze â”€â”€â”€
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

  // Reset freeze every 30 days
  const resetDate = profile.streak_freeze_reset_date
  const today = new Date().toISOString().split('T')[0]

  if (resetDate && resetDate <= today) {
    const { error: resetError } = await supabase
      .from('profiles')
      .update({ streak_freeze_used: false, streak_freeze_reset_date: null })
      .eq('id', userId)

    if (resetError) {
      console.error('Streak freeze reset error:', resetError)
      return false
    }
    return true
  }

  return !profile.streak_freeze_used
}

export async function useStreakFreeze(userId) {
  if (!userId) return false

  const available = await checkStreakFreeze(userId)
  if (!available) return false

  const resetDate = new Date()
  resetDate.setDate(resetDate.getDate() + 30)

  const { error } = await supabase
    .from('profiles')
    .update({
      streak_freeze_used: true,
      streak_freeze_reset_date: resetDate.toISOString().split('T')[0],
    })
    .eq('id', userId)

  if (error) {
    console.error('Streak freeze use error:', error)
    return false
  }

  return true
}
