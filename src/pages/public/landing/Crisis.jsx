import { HELPLINES } from '../../../config/helplines'

export default function Crisis() {
  return (
    <section className="ll-band ll-crisis" id="crisis" aria-labelledby="ll-crisis-title">
      <div className="ll-container ll-center">
        <p className="ll-eyebrow" style={{ color: 'var(--danger)' }}>Crisis help</p>
        <h2 id="ll-crisis-title" className="ll-h2">If you need help right now</h2>
        <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
          These services are free, run around the clock, and you can call them without an account.
        </p>
        <div className="ll-crisis__list">
          {HELPLINES.map((h) => (
            <a key={h.id} href={`tel:${h.tel}`} className={`ll-crisis__item${h.priority ? ' ll-crisis__item--primary' : ''}`}>
              <span>
                <strong>{h.name}{h.priority ? ' — start here' : ''}</strong>
                <small>{h.hours}</small>
              </span>
              <span className="ll-crisis__number">{h.phone}</span>
            </a>
          ))}
        </div>
        <p className="ll-crisis__note">
          If you are in immediate danger, call emergency services (999 or 112) first.
        </p>
      </div>
    </section>
  )
}
