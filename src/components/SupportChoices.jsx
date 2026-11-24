import { useEffect, useState } from 'react'
import { SUPPORT_SERVICES } from '../config/helplines'
import { befriendersAvailability, nextOpeningLabel } from '../lib/supportAvailability'

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