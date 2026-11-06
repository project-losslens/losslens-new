import { supabase } from './supabase'

// Calculate risk score based on diary patterns
export async function calculateRiskScore(userId) {
  if (!userId) return { score: 0, factors: [] }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dayOfWeek = today.getDay()
  const hourOfDay = today.getHours()

  // Get recent diary entries (last 30 days)
  const { data: entries, error: entriesError } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (entriesError) {
    console.error('Risk entries fetch error:', entriesError)
    return { score: 0, factors: [] }
  }

  if (!entries || entries.length < 3) {
    return { score: 10, factors: ['Not enough data yet. Keep logging!'] }
  }

  let score = 0
  const factors = []

  // Factor 1: Day of week pattern
  const sameDayEntries = entries.filter(e => new Date(e.date).getDay() === dayOfWeek)
  const sameDayGambleRate = sameDayEntries.length > 0
    ? sameDayEntries.filter(e => e.gambled).length / sameDayEntries.length
    : 0
  if (sameDayGambleRate > 0.5) {
    score += 25
    factors.push(`${dayOfWeek === 5 || dayOfWeek === 6 ? 'Weekend' : 'This day'} has been high-risk historically`)
  }

  // Factor 2: Recent gambling pattern (last 7 days)
  const last7Days = entries.slice(0, 7)
  const recentGambleRate = last7Days.filter(e => e.gambled).length / last7Days.length
  if (recentGambleRate > 0.3) {
    score += 20
    factors.push('Recent gambling activity detected')
  }

  // Factor 3: Missed diary entries
  const daysSinceLastEntry = entries.length > 0
    ? Math.floor((today - new Date(entries[0].date)) / (1000 * 60 * 60 * 24))
    : 7
  if (daysSinceLastEntry > 2) {
    score += 15
    factors.push(`${daysSinceLastEntry} days since last diary entry`)
  }

  // Factor 4: Stress/mood pattern
  const recentMoods = entries.slice(0, 7).map(e => e.mood)
  const negativeMoods = recentMoods.filter(m =>
    m && (m.includes('Stressed') || m.includes('Anxious') || m.includes('Depressed'))
  ).length
  if (negativeMoods >= 3) {
    score += 20
    factors.push('Elevated stress levels in recent entries')
  }

  // Factor 5: Payday detection
  const dayOfMonth = today.getDate()
  if (dayOfMonth >= 28 || dayOfMonth <= 3) {
    score += 10
    factors.push('Payday period â€” financial triggers may be higher')
  }

  // Factor 6: Weekend
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    score += 5
    factors.push('Weekend â€” historically higher gambling risk')
  }

  // Factor 7: Evening hours
  if (hourOfDay >= 18 || hourOfDay <= 2) {
    score += 5
    factors.push('Evening hours â€” common trigger time')
  }

  score = Math.min(score, 100)

  // Save to profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      daily_risk_score: score,
      risk_factors: factors,
      last_risk_check: todayStr,
    })
    .eq('id', userId)

  if (updateError) console.error('Risk score save error:', updateError)

  return { score, factors }
}

// Get current risk level
export async function getRiskLevel(userId) {
  if (!userId) return { score: 0, level: 'low', factors: [] }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('daily_risk_score, risk_factors, last_risk_check')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    if (profileError) console.error('Risk level fetch error:', profileError)
    return { score: 0, level: 'low', factors: [] }
  }

  const today = new Date().toISOString().split('T')[0]

  if (profile.last_risk_check !== today) {
    return await calculateRiskScore(userId)
  }

  const score = profile.daily_risk_score || 0
  let level = 'low'
  if (score >= 60) level = 'high'
  else if (score >= 30) level = 'medium'

  return {
    score,
    level,
    factors: profile.risk_factors || [],
  }
}

// Get risk color
export function getRiskColor(score) {
  if (score >= 60) return { bg: 'rgba(255,255,255,0.08)', color: '#FFFFFF', label: 'High Risk' }
  if (score >= 30) return { bg: 'rgba(45,212,191,0.15)', color: '#7DBDEE', label: 'Medium Risk' }
  return { bg: 'rgba(255,255,255,0.12)', color: '#2DD4BF', label: 'Low Risk' }
}
