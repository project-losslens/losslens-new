import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { SHOW_PROTECTION } from './protectionContent'
import { COMMON_PACKAGE, PROTECTION_STATUS, STRUCTURES, STRUCTURE_ORDER } from '../../config/protectionProducts'
import { supabase } from '../../lib/supabase'
import { PROTECTION_CONTENT as C } from './protectionContent'
import ContactIcons from '../../components/ContactIcons'
import TopographicBackground from '../../components/TopographicBackground'
import { useDocumentTitle } from '../../hooks'
import '../../styles/landing.css'

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 'var(--space-7)' }}>
      <h2 className="ll-h2" style={{ fontSize: 'var(--step-2)' }}>{title}</h2>
      {children}
    </section>
  )
}

function ProtectionInner() {
  useDocumentTitle('LossLens Protection concept')
  const [user, setUser] = useState(undefined)
  const [state, setState] = useState('idle') // idle | saving | done | error

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user ?? null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const registerInterest = async () => {
    setState('saving')
    const { error } = await supabase.from('upgrade_interest').insert({
      user_id: user.id,
      interested_plan: 'protection',
    })
    setState(error ? 'error' : 'done')
  }

  return (
    <div className="ll-landing">
      <TopographicBackground variant="hero" />
      <main className="ll-band" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="ll-container ll-narrow">
          <p className="ll-eyebrow">LossLens Protection</p>
          <h1 className="ll-h2 ll-protection-header" style={{ fontSize: 'var(--step-4)' }}>An idea we are working on</h1>
          <p className="ll-crisis__note" style={{ marginBottom: 'var(--space-6)' }}>{PROTECTION_STATUS}</p>

          <Section title="One treatment-benefit package. Three ways to access protection.">
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              All three arrangements share the same proposed treatment benefits, clinical rules and claims framework.
              They differ only in how you enrol and how the policy is structured — through an existing medical policy,
              as a standalone individual policy, or through a participating organisation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
              {STRUCTURE_ORDER.map((slug) => {
                const s = STRUCTURES[slug]
                return (
                  <article key={slug} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: 'var(--space-4)' }}>
                    <h3 style={{ color: 'var(--primary)', fontSize: 'var(--step-1)', margin: '0 0 var(--space-2)' }}>{s.name}</h3>
                    <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>{s.tagline}</p>
                    <Link to={`/protection/${slug}`} className="ll-btn ll-btn--ghost" style={{ fontSize: 'var(--step--1)' }}>{s.cta}</Link>
                  </article>
                )
              })}
            </div>
          </Section>

          <Section title={C.what.title}>
            {C.what.body.map((p) => <p className="ll-lede" key={p.slice(0, 30)} style={{ marginBottom: 'var(--space-3)' }}>{p}</p>)}
          </Section>

          <Section title={COMMON_PACKAGE.title}>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>{COMMON_PACKAGE.qualifier}</p>
            <ul className="ll-privacy" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {COMMON_PACKAGE.couldCover.map((i) => <li key={i} className="ll-privacy" style={{ paddingLeft: 'var(--space-5)' }}>{i}</li>)}
            </ul>
          </Section>

          <Section title={C.neverCover.title}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {C.neverCover.items.map((i) => <li key={i} className="ll-lede">{i}</li>)}
            </ul>
          </Section>

          <Section title={C.whoDoesWhat.title}>
            {C.whoDoesWhat.items.map(([who, what]) => (
              <p className="ll-lede" key={who} style={{ marginBottom: 'var(--space-3)' }}>
                <strong style={{ color: 'var(--text)' }}>{who}:</strong> {what}
              </p>
            ))}
          </Section>

          <Section title={C.journey.title}>
            <ol style={{ paddingLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {C.journey.steps.map((s) => <li key={s.slice(0, 30)} className="ll-lede">{s}</li>)}
            </ol>
          </Section>

          <Section title={C.privacy.title}>
            <p className="ll-lede">{C.privacy.body}</p>
          </Section>

          <Section title={C.fairness.title}>
            <p className="ll-lede">{C.fairness.body}</p>
          </Section>

          <Section title={C.interest.title}>
            {user === undefined ? null : user ? (
              <>
                <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>{C.interest.signedIn}</p>
                {state === 'done' ? (
                  <p role="status" style={{ color: 'var(--primary)' }}>{C.interest.success}</p>
                ) : (
                  <button type="button" className="ll-btn ll-btn--primary" onClick={registerInterest} disabled={state === 'saving'}>
                    {state === 'saving' ? 'Saving…' : "Tell us you're interested"}
                  </button>
                )}
                {state === 'error' && <p role="alert" style={{ color: 'var(--danger)', marginTop: 'var(--space-3)' }}>{C.interest.error}</p>}
              </>
            ) : (
              <>
                <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>{C.interest.signedOut}</p>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to="/signup" className="ll-btn ll-btn--primary">Sign up</Link>
                  <ContactIcons subject="Protection interest enquiry" />
                </div>
              </>
            )}
          </Section>

          <p style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/protection/actuarial" className="ll-text-link">Read about the actuarial approach</Link>
          </p>
          <p className="ll-crisis__note" style={{ marginTop: 'var(--space-7)' }}>{C.disclaimer}</p>
          <p style={{ marginTop: 'var(--space-4)' }}><Link to="/" className="ll-btn ll-btn--ghost">Back to LossLens</Link></p>
        </div>
      </main>
    </div>
  )
}

export default function Protection() {
  if (!SHOW_PROTECTION) return <Navigate to="/" replace />
  return <ProtectionInner />
}
