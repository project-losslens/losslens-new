import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { SHOW_PROTECTION } from './protectionContent'
import { supabase } from '../../lib/supabase'
import { PROTECTION_CONTENT as C } from './protectionContent'
import ContactIcons from '../../components/ContactIcons'
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
    <div className="ll-page">
      <main className="ll-band" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="ll-container ll-narrow">
          <p className="ll-eyebrow">LossLens Protection</p>
          <h1 className="ll-h2" style={{ fontSize: 'var(--step-4)' }}>An idea we are working on</h1>
          <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>{C.status}</p>

          <Section title={C.what.title}>
            {C.what.body.map((p) => <p className="ll-lede" key={p.slice(0, 30)} style={{ marginBottom: 'var(--space-3)' }}>{p}</p>)}
          </Section>

          <Section title={C.couldCover.title}>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-3)' }}>{C.couldCover.qualifier}</p>
            <ul className="ll-privacy" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {C.couldCover.items.map((i) => <li key={i} className="ll-privacy" style={{ paddingLeft: 'var(--space-5)' }}>{i}</li>)}
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
