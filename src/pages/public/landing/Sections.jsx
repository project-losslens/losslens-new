import ContactIcons from '../../../components/ContactIcons'
import { HELPLINES } from '../../../config/helplines'
import { Link } from 'react-router-dom'
import { SHOW_PROTECTION } from '../protectionContent'
import { primaryHelpline } from '../../../config/helplines'
import { useEffect, useRef, useState } from 'react'
import { LogoMark } from '../../../components/Brand'
import AppIcon from '../../../components/AppIcon'
import { FACTS } from '../../../config/site'
import { SITE } from '../../../config/site'
// Landing page sections — consolidated from individual files.

/* ---- BehindTheApp.jsx ---- */
export function BehindTheApp() {
  return (
    <section className="ll-band" id="behind-the-app" aria-labelledby="ll-model-title">
      <div className="ll-container">
        <div className="ll-model">
          <div>
            <h2 id="ll-model-title" className="ll-h2">A simple risk picture, kept over time</h2>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              Every diary entry feeds a simple daily risk score: recent gambling days, missed check-ins,
              stress in your own words, payday windows and the time of day. The score is shown to you
              as low, medium or high, with the reasons listed plainly.
            </p>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              For insurers and employers, LossLens can share aggregate figures only — for example how a
              group&rsquo;s risk bands shift over time. Groups smaller than 25 members are never reported,
              so no individual can be picked out. Your diary, your chats and your screening answers are
              never shared.
            </p>
            <p className="ll-lede">
              This is an early model that will be calibrated with real data in a pilot. It is a prompt to
              check in, not a diagnosis and not a prediction of what you will do.
            </p>
          </div>
          <div className="ll-model__diagram">
            <svg viewBox="0 0 320 180" role="img" aria-label="Diagram: diary entries feed a daily risk score, which is grouped into low, medium and high bands">
              <rect x="8" y="60" width="86" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="51" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Diary entries</text>
              <text x="51" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">mood · triggers · spend</text>
              <line x1="94" y1="90" x2="126" y2="90" stroke="var(--primary)" strokeWidth="2" markerEnd="url(#ah)" />
              <rect x="128" y="60" width="86" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="171" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Daily risk score</text>
              <text x="171" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">0–100 · low / med / high</text>
              <line x1="214" y1="90" x2="246" y2="90" stroke="var(--primary)" strokeWidth="2" markerEnd="url(#ah)" />
              <rect x="248" y="60" width="64" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="280" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Aggregate</text>
              <text x="280" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">groups ≥25 only</text>
              <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--primary)" /></marker></defs>
            </svg>
            <p className="ll-model__caption">What you see stays yours. Partners see grouped numbers only.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- Contact.jsx ---- */

export function Contact() {
  return (
    <section className="ll-band" id="contact" aria-labelledby="ll-contact-title">
      <div className="ll-container ll-narrow ll-contact">
        <h2 id="ll-contact-title" className="ll-h2">Talk to us</h2>
        <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
          Questions, feedback, partnerships or a pilot idea — we read everything.
        </p>
        <div className="ll-contact__icons">
          <ContactIcons subject="Hello from the LossLens website" size={22} />
        </div>
      </div>
    </section>
  )
}

/* ---- Crisis.jsx ---- */

export function Crisis() {
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

/* ---- Footer.jsx ---- */

const LINKS = [
  { to: '/login', label: 'Log in' },
  { to: '/signup', label: 'Sign up' },
  { to: '/pricing', label: 'Pricing' },
  ...(SHOW_PROTECTION ? [{ to: '/protection', label: 'Protection' }] : []),
  { to: '/insurer/login', label: 'For insurers' },
  { href: '#partners', label: 'For therapists' },
  { href: '#contact', label: 'Contact' },
  { href: '#crisis', label: 'Crisis help' },
]

export function Footer() {
  return (
    <footer className="ll-footer">
      <div className="ll-footer__inner">
        <div className="ll-footer__links">
          {LINKS.map((l) => (
            'to' in l
              ? <Link key={l.label} to={l.to}>{l.label}</Link>
              : <a key={l.label} href={l.href}>{l.label}</a>
          ))}
        </div>
        <ContactIcons tone="on-dark" subject="Footer enquiry" />
        <div className="ll-footer__crisis">
          In crisis? Call <a href={`tel:${primaryHelpline.tel}`}>{primaryHelpline.name} {primaryHelpline.phone}</a>{' '}
          or <a href="tel:1192">NACADA 1192</a> — free, 24/7. If you are in danger, call the helplines above.
        </div>
        <p>© 2026 LossLens · Gambling harm reduction · Kenya</p>
        <p>LossLens is not an insurance company. We would work with licensed insurers.</p>
        <p>
          <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
          {' · '}
          <Link to="/terms" style={{ color: 'inherit' }}>Terms</Link>
        </p>
      </div>
    </footer>
  )
}

/* ---- Header.jsx ---- */

const NAV_LINKS = [
  { href: '#what-it-does', label: 'What it does' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#partners', label: 'Partners' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#pricing', label: 'Pricing' },
  ...(SHOW_PROTECTION ? [{ href: '/protection', label: 'Protection' }] : []),
]

export function Header({ onLogin, onSignup }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
      if (e.key === 'Tab' && menuRef.current) {
        const items = menuRef.current.querySelectorAll('a, button')
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="ll-header">
      <div className="ll-header__inner">
        <Link to="/" className="ll-brand" aria-label="LossLens home">
          <LogoMark size={30} petalClass="" />
          <span>Loss<span className="ll-brand__lens">Lens</span></span>
        </Link>
        <nav className="ll-nav" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <a href="#crisis" style={{ color: 'var(--danger)', fontWeight: 600 }}>Crisis help</a>
        </nav>
        <div className="ll-header__actions">
          <button type="button" className="ll-btn ll-btn--ghost" onClick={onLogin}>Log in</button>
          <button type="button" className="ll-btn ll-btn--primary" onClick={onSignup}>Get started</button>
        </div>
        <button
          ref={buttonRef}
          type="button"
          className="ll-burger"
          aria-expanded={open}
          aria-controls="ll-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <AppIcon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>
      {open && (
        <div className="ll-menu" id="ll-mobile-menu" ref={menuRef}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <a href="#crisis" onClick={() => setOpen(false)} style={{ color: 'var(--danger)', fontWeight: 600 }}>Crisis help</a>
          <button type="button" className="ll-btn ll-btn--ghost ll-btn--block" onClick={() => { setOpen(false); onLogin() }}>Log in</button>
          <button type="button" className="ll-btn ll-btn--primary ll-btn--block" onClick={() => { setOpen(false); onSignup() }}>Get started</button>
        </div>
      )}
    </header>
  )
}

/* ---- Hero.jsx ---- */

export function Hero({ onSignup }) {
  return (
    <section className="ll-hero" aria-labelledby="ll-hero-title">
      <LogoMark size={560} className="ll-hero__motif" petalClass="" />
      <div className="ll-hero__grid">
        <div>
          <h1 id="ll-hero-title">Get a grip on your betting, privately and for free.</h1>
          <p className="ll-hero__sub">
            LossLens is a free recovery companion for people affected by betting in Kenya.
            Log your days, talk to Oloo when the urge hits, and find people who understand —
            without anyone knowing it is you.
          </p>
          <div className="ll-hero__actions">
            <button type="button" className="ll-btn ll-btn--primary" onClick={onSignup}>Start free</button>
            <a className="ll-btn ll-btn--ghost" href="#how-it-works">See how it works</a>
          </div>
          <p className="ll-hero__trust">
            <span>Private by design</span>
            <span>Anonymous peer rooms</span>
            <span>Free core features</span>
          </p>
        </div>
        <div>
          <div className="ll-phone" role="img" aria-label="Sample screen of the LossLens app">
            <div className="ll-phone__screen">
              <div className="ll-phone__bar"><span>LossLens</span><span>Today</span></div>
              <div className="ll-phone__body">
                <div className="ll-mock-streak"><strong>6</strong><span>day streak</span></div>
                <div className="ll-mock-card">
                  <small>Diary</small>
                  <p>Logged at 23:40. Urge passed after the breathing exercise.</p>
                </div>
                <div className="ll-mock-chat">
                  <small>Oloo</small>
                  <p>That was a hard night. Want to talk about what triggered it?</p>
                </div>
              </div>
            </div>
          </div>
          <p className="ll-phone__label">Sample screen</p>
        </div>
      </div>
    </section>
  )
}

/* ---- HowItWorks.jsx ---- */
const STEPS = [
  { title: 'Check in each day', body: 'A two-minute diary entry: mood, triggers, what you spent. Small and honest beats perfect.' },
  { title: 'Notice your patterns', body: 'The dashboard and risk picture show when urges cluster — payday, weekends, late nights.' },
  { title: 'Talk when it hits', body: 'Oloo and the Urge Toolkit are there in the moment, not after it.' },
  { title: 'Reach people', body: 'The Circle, Whispers and your Family Portal keep you connected to humans who get it.' },
]

export function HowItWorks() {
  return (
    <section className="ll-band ll-band--surface" id="how-it-works" aria-labelledby="ll-steps-title">
      <div className="ll-container">
        <h2 id="ll-steps-title" className="ll-h2">How it works</h2>
        <div className="ll-steps">
          {STEPS.map((s) => (
            <div className="ll-step" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- Numbers.jsx ---- */

export function Numbers() {
  const shown = FACTS.filter((f) => f.id !== 'sha-statement')
  return (
    <section className="ll-band" aria-labelledby="ll-numbers-title">
      <div className="ll-container">
        <h2 id="ll-numbers-title" className="ll-h2 ll-center">Betting in Kenya, in numbers</h2>
        <div className="ll-numbers">
          {shown.map((f) => (
            <div className="ll-stat" key={f.id}>
              <span className="ll-stat__value">{f.value}</span>
              <span className="ll-stat__label">{f.label}</span>
              <span className="ll-stat__src">
                Source:{' '}
                <a href={f.url} target="_blank" rel="noopener noreferrer">{f.source}</a>
                {' '}· verified {f.verifiedOn}
              </span>
            </div>
          ))}
        </div>
        <p className="ll-caption ll-center">
          These figures describe betting in Kenya. They are not measurements of LossLens or its results.
        </p>
      </div>
    </section>
  )
}

/* ---- Origin.jsx ---- */

export function Origin() {
  if (!SITE.founderNote) return null
  return (
    <section className="ll-band ll-origin" aria-labelledby="ll-origin-title">
      <div className="ll-container ll-narrow ll-center">
        <h2 id="ll-origin-title" className="ll-h2">Why we built this</h2>
        <blockquote>{SITE.founderNote}</blockquote>
        {SITE.credibility?.length > 0 && (
          <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
            {SITE.credibility.join(' · ')}
          </p>
        )}
      </div>
    </section>
  )
}

/* ---- Partners.jsx ---- */

export function Partners() {
  return (
    <section className="ll-band ll-band--surface" id="partners" aria-labelledby="ll-partners-title">
      <div className="ll-container">
        <h2 id="ll-partners-title" className="ll-h2">For insurers, employers and clinicians</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          LossLens is built to work alongside the people who fund and deliver care —
          with privacy designed in from the start.
        </p>
        <div className="ll-partners">
          <article className="ll-partner">
            <h3>For insurers and sponsors</h3>
            <p>We are looking for a licensed insurer or sponsor to run a small pilot.</p>
            <ul>
              <li>Aggregate-only risk analytics; groups smaller than 25 members are never reported.</li>
              <li>No individual diaries, chats or screening answers are ever shared.</li>
              <li>LossLens is not an insurance company. We would work with licensed insurers.</li>
            </ul>
            <div className="ll-partner__actions">
              <ContactIcons subject="Insurer pilot enquiry" />
              <Link to="/insurer/login" style={{ color: 'var(--primary)', fontSize: 'var(--step--1)' }}>Insurer log in</Link>
            </div>
          </article>
          <article className="ll-partner">
            <h3>For therapists</h3>
            <p>LossLens is building a network of qualified clinicians. Sessions can be
            pre-approved and claims are tracked in the platform.</p>
            <ul>
              <li>Refer clients into structured support tools.</li>
              <li>Track sessions and claims without leaving the platform.</li>
            </ul>
            <div className="ll-partner__actions">
              <ContactIcons subject="Therapist network enquiry" />
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ---- PricingPreview.jsx ---- */

const PLANS = [
  { name: 'Free', price: 'KES 0', period: 'forever', desc: 'Full access to all core recovery tools. No credit card needed.', featured: false },
  { name: 'Premium', price: 'KES 499', period: '/month', desc: 'Advanced features for committed recovery, and you help keep LossLens free for everyone.', featured: true },
  { name: 'Company', price: 'KES 199', period: '/employee/month', desc: 'For employers. Premium features at a subsidized rate; your data stays private from your employer.', featured: false },
]

export function PricingPreview() {
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

/* ---- Privacy.jsx ---- */
export function Privacy() {
  return (
    <section className="ll-band" id="privacy" aria-labelledby="ll-privacy-title">
      <div className="ll-container ll-narrow ll-privacy">
        <h2 id="ll-privacy-title" className="ll-h2">Your data belongs to you</h2>
        <p className="ll-lede">
          LossLens is designed with the Data Protection Act 2019 in mind. Here is what that means
          in practice, based on how the app is built:
        </p>
        <ul>
          <li><strong>Your diary stays private.</strong> Entries are visible to you, not to partners or advertisers.</li>
          <li><strong>Oloo is an AI companion</strong> powered by a third-party AI service. Before your
          first chat, the app asks for your consent, and the server refuses to send your context to the
          AI without it.</li>
          <li><strong>AI chats are never shared with partners</strong> — not insurers, not employers.</li>
          <li><strong>Partners see aggregate figures only.</strong> Small groups are never reported.</li>
          <li><strong>Anonymous rooms use no real names.</strong> The Circle and Whispers identify you by
          a hashed alias, not your account details.</li>
        </ul>
      </div>
    </section>
  )
}

/* ---- ProtectionTeaser.jsx ---- */

export function ProtectionTeaser() {
  if (!SHOW_PROTECTION) return null
  return (
    <section className="ll-band ll-band--warm ll-protection-teaser" aria-labelledby="ll-protection-title">
      <div className="ll-container ll-narrow">
        <p className="ll-eyebrow">In development</p>
        <h2 id="ll-protection-title" className="ll-h2">LossLens Protection: an idea we are working on</h2>
        <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
          We are researching a way for health insurance to help pay for professional treatment of
          gambling disorder. It is not available yet — this is a concept, not an offer.
        </p>
        <ul>
          <li>It would never pay betting losses or debts.</li>
          <li>A licensed insurer decides cover; clinicians decide treatment.</li>
          <li>Your diary, Oloo chats and risk scores are never shared with an insurer.</li>
        </ul>
        <Link to="/protection" className="ll-btn ll-btn--warm">Read the concept</Link>
      </div>
    </section>
  )
}

/* ---- TheGap.jsx ---- */

const sha = FACTS.find((f) => f.id === 'sha-statement')

export function TheGap() {
  return (
    <section className="ll-band ll-band--surface" id="the-gap" aria-labelledby="ll-gap-title">
      <div className="ll-container">
        <h2 id="ll-gap-title" className="ll-h2">Help exists. Reaching it is the hard part.</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          Counselling and peer support do exist in Kenya. What is missing is something most people
          can actually reach at 2am, on a cheap Android phone, without explaining themselves to anyone.
        </p>
        <div className="ll-gap">
          <div className="ll-gap__col">
            <h3>What exists</h3>
            <ul>
              <li>Free and low-cost counselling and support lines, including Befrienders Kenya and NACADA.</li>
              <li>In April 2025, Kenya's Ministry of Health said gambling rehabilitation is included in the Social Health Authority (SHA) benefit packages.
                {' '}<a href={sha?.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Source</a></li>
            </ul>
          </div>
          <div className="ll-gap__col ll-gap__col--missing">
            <h3>What is missing</h3>
            <ul>
              <li>A way to notice your own patterns before they become a crisis.</li>
              <li>Support that fits in a pocket, works on slow data, and asks nothing of your pride.</li>
              <li>Clear, honest information about what help costs and who provides it.</li>
            </ul>
          </div>
        </div>
        <p className="ll-sha-note">
          <strong>A note on SHA.</strong> The Ministry statement above describes benefit packages in general.
          It is not a promise that a given facility will treat you, and LossLens is not a SHA provider
          and does not deliver SHA services.
        </p>
      </div>
    </section>
  )
}

/* ---- WhatItDoes.jsx ---- */

const GROUPS = [
  {
    name: 'Track',
    items: [
      { icon: 'diary', name: 'Diary', line: 'Log mood, triggers and spending in a couple of minutes a day.', lead: true },
      { icon: 'home', name: 'Dashboard', line: 'Your streak, money saved and a simple risk picture over time.' },
      { icon: 'toolkit', name: 'Urge Toolkit', line: 'Breathing, timers and thought exercises for the moment an urge hits.' },
    ],
  },
  {
    name: 'Talk',
    items: [
      { icon: 'chat', name: 'Oloo', line: 'An AI companion that remembers what you tell it and checks in with you.', lead: true },
      { icon: 'users', name: 'The Circle', line: 'Anonymous rooms for check-ins, urge support and celebrating clean days.' },
      { icon: 'users', name: 'Whispers', line: 'Get matched with a peer for a private, time-limited anonymous chat.' },
    ],
  },
  {
    name: 'Reflect',
    items: [
      { icon: 'brain', name: 'CBT Modules', line: 'Structured lessons on triggers, distorted thinking and coping.' },
      { icon: 'profile', name: 'Monthly Mirror', line: 'Record a short monthly reflection and watch what changes.' },
      { icon: 'document', name: 'LossLens Pact', line: 'Record a message to your future self for the hard days.' },
    ],
  },
  {
    name: 'Reach out',
    items: [
      { icon: 'calendar', name: 'Events', line: 'Support groups and workshops you can RSVP to.' },
      { icon: 'resources', name: 'Resources', line: 'Helplines, self-exclusion tools and practical guides.' },
      { icon: 'users', name: 'Family Portal', line: 'Invite someone you trust; they see only what you choose to share.' },
    ],
  },
]

export function WhatItDoes() {
  return (
    <section className="ll-band" id="what-it-does" aria-labelledby="ll-features-title">
      <div className="ll-container">
        <h2 id="ll-features-title" className="ll-h2">What LossLens actually does</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          Everything below is in the app today. Feature names match what you will see after signing up.
        </p>
        {GROUPS.map((g) => (
          <div key={g.name} style={{ marginBottom: 'var(--space-6)' }}>
            <p className="ll-feature__group" style={{ marginBottom: 'var(--space-3)' }}>{g.name}</p>
            <div className="ll-features">
              {g.items.map((f) => (
                <article className={`ll-feature${f.lead ? ' ll-feature--lead' : ''}`} key={f.name}>
                  <span className="ll-feature__icon"><AppIcon name={f.icon} size={20} /></span>
                  <h3>{f.name}</h3>
                  <p>{f.line}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
        <p style={{ marginTop: 'var(--space-5)' }}>
          <a href="#pricing" className="ll-btn ll-btn--ghost">See plans</a>
        </p>
      </div>
    </section>
  )
}
