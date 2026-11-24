import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '../../layouts/PublicLayout'
import SupportChoices from '../../components/SupportChoices'
import { useDocumentTitle } from '../../hooks'
import { canShowInstall, showInstallPrompt } from '../../lib/pwa'
import { PROTECTION_STATUS } from '../../config/protectionProducts'

const INSTALL_DISMISSED_UNTIL = 'll_install_dismissed_until'
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000

function InstallPrompt() {
  const [available, setAvailable] = useState(() => canShowInstall())
  const [dismissed, setDismissed] = useState(() => {
    try { return Number(localStorage.getItem(INSTALL_DISMISSED_UNTIL)) > Date.now() }
    catch { return false }
  })
  useEffect(() => {
    const update = () => setAvailable(canShowInstall())
    const timer = window.setTimeout(update, 0)
    window.addEventListener('beforeinstallprompt', update)
    window.addEventListener('appinstalled', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', update)
      window.removeEventListener('appinstalled', update)
    }
  }, [])
  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(INSTALL_DISMISSED_UNTIL, String(Date.now() + FOURTEEN_DAYS)) }
    catch { /* A blocked preference store must not prevent dismissal. */ }
  }
  const install = async () => {
    const installed = await showInstallPrompt()
    setAvailable(canShowInstall())
    if (installed) dismiss()
  }
  if (!available || dismissed) return null
  // Keep installation in document flow, away from first-screen help actions.
  return <aside className="hp-install" aria-label="Install LossLens">
    <p>Add LossLens to your home screen for quicker access.</p>
    <div><button className="hp-text-link" onClick={dismiss}>Not now</button><button className="hp-button" onClick={install}>Install</button></div>
  </aside>
}

function ResultExample() {
  return <div className="hp-result" aria-label="About the PGSI self-check">
    <div className="hp-result__top"><span>PGSI self-check</span></div>
    <h3>What the self-check shows you</h3>
    <p className="hp-result__explanation" style={{ margin: '0 0 14px' }}>Nine questions about gambling over the past 12 months produce a score out of 27, shown as a percentage of the maximum. It is a screening tool, not a diagnosis — your dashboard explains what your own answers suggest and offers support you can choose to use.</p>
    <p className="hp-result__note" style={{ margin: 0 }}><Link className="hp-text-link" to="/onboarding">Take the nine-question self-check</Link></p>
  </div>
}

export default function Landing() {
  useDocumentTitle('Gambling support in Kenya')
  return <PublicLayout home>
    <main className="hp-main">
      <section className="ll-hero hp-hero" aria-labelledby="ll-hero-title">
        <div className="hp-hero__copy">
          <p className="hp-eyebrow">Gambling support in Kenya</p>
          <h1 id="ll-hero-title">When gambling starts taking more than money.</h1>
          <p className="hp-hero__intro">If betting is affecting your sleep, your relationships, or the money you need for everyday life, LossLens can help you take a first step. Explore what’s changing or find someone to talk to in Kenya.</p>
          <div className="hp-hero__actions">
            <Link className="hp-button hp-button--light" to="/onboarding" aria-describedby="hp-account-note">Start a self-check</Link>
            <a className="hp-button hp-button--outline" href="#crisis-help">Find human support</a>
          </div>
          <p className="hp-hero__note" id="hp-account-note">An account is needed for the self-check. Human support needs no registration.</p>
        </div>
        <div className="hp-hero__type" aria-hidden="true">
          <span className="hp-hero__type-caption">At your pace</span>
          <p>A pause.<br />A question.<br /><span>A first step.</span></p>
          <span className="hp-hero__type-line" />
        </div>
      </section>

      <section className="hp-help" id="features" aria-labelledby="ll-features-title">
        <div className="ll-container">
          <span id="why" className="hp-anchor" aria-hidden="true" />
          <span id="faq" className="hp-anchor" aria-hidden="true" />
          <p className="hp-eyebrow">Begin where you are</p>
          <h2 id="ll-features-title">What would help today?</h2>
          <div className="hp-help__rows">
            <article className="hp-help__row">
              <h3>Understand my gambling</h3>
              <div><p>The PGSI self-check asks nine questions about gambling over the past 12 months. You’ll see your score, an explanation of what it means, and support you can choose to use.</p><Link className="hp-text-link" to="/onboarding">Take the nine-question self-check</Link><small>An account is required to complete and save it.</small></div>
            </article>
            <article className="hp-help__row" id="oloo">
              <h3>Work through an urge</h3>
              <div><p>Oloo is an AI companion. You can tell it, “An urge is building. Help me pause before I bet,” and talk through what is happening. The Urge Toolkit also has a breathing exercise and a ten-minute pause timer.</p><Link className="hp-text-link" to="/urge-toolkit">Open the Urge Toolkit and Oloo</Link><small>Sign-in required. Oloo is AI, not a human counsellor.</small></div>
            </article>
            <article className="hp-help__row">
              <h3>Talk to someone</h3>
              <div><p>Contact Befrienders Kenya by phone, or Gamhelp Kenya by phone or online. You can reach these services without a LossLens account. Check their published hours below; an immediate response is not guaranteed.</p><a className="hp-text-link" href="#crisis-help">See human-support options</a></div>
            </article>
          </div>
        </div>
      </section>

      <section className="hp-product" id="how-it-works" aria-labelledby="ll-steps-title">
        <div className="ll-container hp-product__grid">
          <div className="hp-product__copy"><p className="hp-eyebrow">A little more understanding</p><h2 id="ll-steps-title">Make sense of your result.</h2><p>You don’t have to interpret a number on your own. After the self-check, your dashboard shows your score and a “Know more” explanation of your own result.</p><p>You can read what your answers suggest and explore support options. Whatever your score, you choose what to do next.</p></div>
          <ResultExample />
        </div>
      </section>

      <section className="hp-protection" id="protection" aria-labelledby="ll-protection-title">
        <div className="ll-container hp-protection__grid"><h2 id="ll-protection-title">Looking ahead to treatment costs</h2><div><p>LossLens Protection is a proposal to help finance eligible treatment through an insurer. It is still in development. You can use the recovery resources on LossLens independently.</p><Link className="hp-text-link hp-text-link--light" to="/protection" title={PROTECTION_STATUS}>Read about the Protection proposal</Link></div></div>
      </section>

      <section className="hp-support" id="crisis-help" tabIndex={-1} aria-labelledby="ll-crisis-title">
        <div className="ll-container">
          <div className="hp-support__intro"><div><p className="hp-eyebrow">A person at the other end</p><h2 id="ll-crisis-title">Would you rather talk to someone?</h2></div><div><p>You don’t need to finish a self-check or create an account to contact a service.</p><a className="hp-button" href="#support-options">See public support options</a></div></div>
          <div id="support-options" tabIndex={-1} className="hp-support__options"><SupportChoices /></div>
        </div>
      </section>
    </main>
    <InstallPrompt />
  </PublicLayout>
}
