// Shared recovery calendar, matching PostgreSQL recompute_progress().
export function recoveryDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const get = type => parts.find(part => part.type === type).value
  return [get('year'), get('month'), get('day')].join('-')
}
