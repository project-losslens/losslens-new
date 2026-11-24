const DAY_MS = 24 * 60 * 60 * 1000
export function befriendersAvailability(value = new Date()) {
  const now = new Date(value)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = type => parts.find(part => part.type === type)?.value
  const weekday = !['Sat', 'Sun'].includes(get('weekday'))
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  const open = weekday && minutes >= 540 && minutes < 1020
  // Nairobi is UTC+03:00, independent of the device's timezone.
  const opening = Date.parse(`${get('year')}-${get('month')}-${get('day')}T09:00:00+03:00`)
  let nextOpensAt = null
  if (!open) for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(opening + offset * DAY_MS)
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' }).format(candidate)
    if (!['Sat', 'Sun'].includes(day) && candidate.getTime() > now.getTime()) { nextOpensAt = candidate.toISOString(); break }
  }
  return { open, nextOpensAt }
}
export function nextOpeningLabel(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' (Nairobi time)'
}