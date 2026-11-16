import { Link, useParams, Navigate } from 'react-router-dom'
import ContactIcons from '../../components/ContactIcons'
import TopographicBackground from '../../components/TopographicBackground'
import { COMMON_PACKAGE, PROTECTION_STATUS, STRUCTURES, STRUCTURE_ORDER } from '../../config/protectionProducts'
import { SHOW_PROTECTION } from './protectionContent'
import { useDocumentTitle } from '../../hooks'
import '../../styles/landing.css'

function Block({ title, children }) {
  return (
    <section style={{ marginBottom: 'var(--space-7)' }}>
      <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>{title}</h2>
      {children}
    </section>
  )
}

function ProductPage({ slug }) {
  const product = STRUCTURES[slug]
  useDocumentTitle(product ? `${product.name} — LossLens Protection` : 'LossLens Protection')
  if (!product) return <Navigate to="/protection" replace />

  return (
    <div className="ll-landing">
      <TopographicBackground variant="hero" />
      <main className="ll-band" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="ll-container ll-narrow">
          <p className="ll-eyebrow"><Link to="/protection" style={{ color: 'inherit' }}>LossLens Protection</Link></p>
          <h1 className="ll-h2" style={{ fontSize: 'var(--step-4)' }}>{product.name}</h1>
          <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>{product.tagline}</p>
          <p className="ll-crisis__note" style={{ marginBottom: 'var(--space-6)' }}>{PROTECTION_STATUS}</p>

          <Block title="Who this is for">
            <p className="ll-lede">{product.forWho}</p>
          </Block>

          <Block title="How enrolment works">
            <ol style={{ paddingLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {product.enrolment.map((s) => <li key={s.slice(0, 30)} className="ll-lede">{s}</li>)}
            </ol>
          </Block>

          <Block title="Who provides the insurance">
            <p className="ll-lede">{product.whoProvides}</p>
          </Block>

          <Block title="How premiums are determined">
            <p className="ll-lede">{product.premium}</p>
          </Block>

          <Block title={COMMON_PACKAGE.title}>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>{COMMON_PACKAGE.qualifier}</p>
            <ul className="ll-privacy" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {COMMON_PACKAGE.couldCover.map((i) => <li key={i} className="ll-privacy" style={{ paddingLeft: 'var(--space-5)' }}>{i}</li>)}
            </ul>
            <h3 className="ll-h2" style={{ fontSize: 'var(--step-1)', marginTop: 'var(--space-5)' }}>What it would never cover</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {COMMON_PACKAGE.neverCover.map((i) => <li key={i} className="ll-lede">{i}</li>)}
            </ul>
          </Block>

          <Block title="Clinical verification and claims">
            <ol style={{ paddingLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {COMMON_PACKAGE.process.map((s) => <li key={s.slice(0, 30)} className="ll-lede">{s}</li>)}
            </ol>
            <p className="ll-lede" style={{ marginTop: 'var(--space-3)' }}>
              A LossLens quiz, risk score or Oloo conversation never creates a clinical diagnosis or determines insurance eligibility.
            </p>
          </Block>

          <Block title="Your privacy">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {COMMON_PACKAGE.privacy.map((i) => <li key={i} className="ll-lede">{i}</li>)}
            </ul>
          </Block>

          <Block title="Compare the three structures">
            <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>
              All three arrangements share the same treatment-benefit package above — they differ only in how you enrol and how the policy is structured.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {STRUCTURE_ORDER.filter((s) => s !== slug).map((s) => (
                <Link key={s} to={`/protection/${s}`} className="ll-btn ll-btn--ghost">{STRUCTURES[s].name}</Link>
              ))}
            </div>
          </Block>

          <Block title="Register interest">
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              This product is not yet available. Contact the team to register interest, or sign up to be notified if it launches.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <ContactIcons subject={`${product.name} enquiry`} />
              <Link to="/signup" className="ll-btn ll-btn--primary">Sign up</Link>
            </div>
          </Block>

          <p className="ll-crisis__note" style={{ marginTop: 'var(--space-7)' }}>{PROTECTION_STATUS}</p>
          <p style={{ marginTop: 'var(--space-4)' }}><Link to="/protection" className="ll-btn ll-btn--ghost">Back to Protection overview</Link></p>
        </div>
      </main>
    </div>
  )
}

export default function ProtectionProduct() {
  if (!SHOW_PROTECTION) return <Navigate to="/" replace />
  return <ProductPage slug={useParams().structure} />
}
