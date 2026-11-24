import { useEffect, useState } from 'react'
import { SUPPORT_SERVICES } from '../config/helplines'

export default function SupportChoices() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer) }, [])
  const availability = befriendersAvailability(now)
  const services = [...SUPPORT_SERVICES].sort((a, b) => {
    const primary = availability.open ? 'befrienders' : 'gamhelp'
    return Number(b.id === primary) - Number(a.id === primary)
  })
  return <div className="support-choices">
    <p>These external services are available to people at every score. You do not need LossLens Protection cover. Choose a service to contact; nothing is sent automatically.</p>
    {services.map((service, index) => <article className="card" key={service.id}>
      <h3>{service.name}</h3>
      <p>{service.hours}</p>
      {service.id === 'befrienders' && <p className="support-hours" role="status">{availability.open ? 'Within published hours' : `Outside published hours. Next opens ${nextOpeningLabel(availability.nextOpensAt)}.`}</p>}
      <p className="pgsi-muted">Published hours are not a promise of an immediate response.</p>
      <div className="pgsi-actions">
        <a className={index === 0 ? 'btn-primary' : 'btn-ghost'} href={service.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Visit {service.name}</a>
        <a className="btn-ghost" href={`tel:${service.tel}`}>Call {service.name}</a>
      </div>
    </article>)}
  </div>
}

const DAY_MS = 24 * 60 * 60 * 1000
function befriendersAvailability(value = new Date()) {
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
function nextOpeningLabel(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' (Nairobi time)'
}
