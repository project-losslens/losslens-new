import { Link } from 'react-router-dom'

const PLANS = [
  { name: 'Free', price: 'KES 0', period: 'forever', desc: 'Full access to all core recovery tools. No credit card needed.', featured: false },
  { name: 'Premium', price: 'KES 499', period: '/month', desc: 'Advanced features for committed recovery, and you help keep LossLens free for everyone.', featured: true },
  { name: 'Company', price: 'KES 199', period: '/employee/month', desc: 'For employers. Premium features at a subsidized rate; your data stays private from your employer.', featured: false },
]

export default function PricingPreview() {
  return (
    <section className="ll-band ll-band--surface" id="pricing" aria-labelledby="ll-pricing-title">
      <div className="ll-container">
        <h2 id="ll-pricing-title" className="ll-h2 ll-center">Pricing</h2>
        <p className="ll-lede ll-center" style={{ margin: '0 auto var(--space-6)', maxWidth: '36rem' }}>
          Core recovery features are free. Premium and Company plans are optional.
        </p>
        <div className="ll-plans">
          {PLANS.map((p) => (
            <article className={`ll-plan${p.featured ? ' ll-plan--featured' : ''}`} key={p.name}>
              <span className="ll-plan__name">{p.name}</span>
              <span className="ll-plan__price">{p.price} <small>{p.period}</small></span>
              <p>{p.desc}</p>
            </article>
          ))}
        </div>
        <p className="ll-center" style={{ marginTop: 'var(--space-5)' }}>
          <Link to="/pricing" className="ll-btn ll-btn--ghost">See full plans</Link>
        </p>
      </div>
    </section>
  )
}
