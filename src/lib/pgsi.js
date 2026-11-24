// Display and scheduling only. Assessment totals are calculated by submit_pgsi().
export const PGSI_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
export function validPgsiAnswers(answers) {
  return Array.isArray(answers) && answers.length === 9
    && Array.from(answers).every(value => Number.isInteger(value) && value >= 0 && value <= 3)
}
export function pgsiBand(raw) {
  if (!Number.isInteger(raw) || raw < 0 || raw > 27) throw new Error('Invalid PGSI total')
  return raw === 0 ? 'none' : raw <= 2 ? 'low' : raw <= 7 ? 'moderate' : 'high'
}
export function pgsiPercentage(raw) { pgsiBand(raw); return Math.round(raw / 27 * 100) }
export function pgsiIsDue(completedAt, now = Date.now()) {
  if (completedAt == null) return true
  const completed = new Date(completedAt).getTime()
  return Number.isFinite(completed) && now >= completed + PGSI_INTERVAL_MS
}
export function sessionLoginKey(session) {
  if (!session?.user?.id) return null
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.session_id) return payload.session_id
    const events = Array.isArray(payload.amr) ? payload.amr.filter(event => event.method !== 'refresh_token') : []
    if (events.length) return `${session.user.id}:${events.map(event => `${event.method}:${event.timestamp}`).sort().join('|')}`
  } catch { /* No unverified token data is used for authorization. */ }
  return `${session.user.id}:restored-session`
}
export function claimLoginReminder(storage, userId, loginId, due) {
  if (!userId || !loginId) return false
  const key = `losslens:pgsi-reminder:${userId}`
  if (storage.getItem(key) === loginId) return false
  // Also remember non-due logins: a refresh crossing the boundary is not a new login.
  storage.setItem(key, loginId)
  return due === true
}
export const PGSI_EXPLANATIONS = {
  none: 'Your answers did not report the experiences measured by these nine questions. Support is still available if you want it.',
  low: 'Your answers fall in the low-risk PGSI range (1-2). You may find it useful to talk about any effects gambling has had on your life.',
  moderate: 'Your answers fall in the moderate-risk PGSI range (3-7). They suggest some gambling-related difficulties may be present. You can choose support at any time.',
  high: 'Your answers fall in the PGSI problem-gambling range (8-27). They suggest gambling may be affecting your life. Talking with a counsellor is an option, and you choose whether to take it.',
}