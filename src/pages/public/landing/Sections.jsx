import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppIcon from '../../../components/AppIcon'
import { LogoMark } from '../../../components/Brand'
import ContactIcons from '../../../components/ContactIcons'
import { HELPLINES, primaryHelpline } from '../../../config/helplines'
import { roleHome } from '../../../config/roleHome'
import { SHOW_PROTECTION } from '../protectionContent'
import { useAuthProfile } from '../../../context/AuthProfileContext'
import '../../../styles/landing.css'

const NAV_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#crisis', label: 'Crisis help' },
]

export function Header() {
  const { pathname } = useLocation()
  const { authStatus, user, role } = useAuthProfile()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const isHome = pathname === '/'
  const dashboardPath = roleHome(role)

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
      if (event.key !== 'Tab' || !menuRef.current) return

      const focusable = [...menuRef.current.querySelectorAll('a, button')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const actions = (
    <>
      <Link className="ll-btn ll-btn--ghost" to="/login">Log in</Link>
      {isHome && authStatus === 'ready' && user
        ? <Link className="ll-btn ll-btn--primary" to={dashboardPath}>Open dashboard</Link>
        : <Link className="ll-btn ll-btn--primary" to="/signup">Start free</Link>}
    </>
  )

  return (
    <header className="ll-header">
      <div className="ll-header__inner">
        <Link to="/" className="ll-brand" aria-label="LossLens home">
          <LogoMark size={30} petalClass="" />
          <span>Loss<span className="ll-brand__lens">Lens</span></span>
        </Link>
        <nav className="ll-nav" aria-label="Primary">
          {NAV_LINKS.map((item) => <Link key={item.label} to={item.href}>{item.label}</Link>)}
        </nav>
        <div className="ll-header__actions">{actions}</div>
        <button
          ref={buttonRef}
          type="button"
          className="ll-burger"
          aria-expanded={open}
          aria-controls="ll-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          <AppIcon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>
      {open && (
        <nav className="ll-menu" id="ll-mobile-menu" ref={menuRef} aria-label="Mobile">
          {NAV_LINKS.map((item) => (
            <Link key={item.label} to={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          {actions}
        </nav>
      )}
    </header>
  )
}

export function Footer() {
  return (
    <footer className="ll-footer">
      <div className="ll-footer__inner">
        <nav className="ll-footer__links" aria-label="Footer">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/partners#insurers">For insurers</Link>
          <Link to="/partners#therapists">For therapists</Link>
          <Link to="/about">About</Link>
          {SHOW_PROTECTION && <Link to="/protection">Protection</Link>}
        </nav>
        <ContactIcons tone="on-dark" subject="Footer enquiry" />
        <p>LossLens is not an insurance company.</p>
        <small>© 2026 LossLens · Gambling harm reduction · Kenya</small>
      </div>
    </footer>
  )
}

export function Hero() {
  return (
    <section className="ll-hero" aria-labelledby="ll-hero-title">
      <div className="ll-hero__grid">
        <div className="ll-hero__copy">
          <p className="ll-eyebrow">A private place to start</p>
          <h1 id="ll-hero-title">Support for changing your relationship with betting.</h1>
          <p className="ll-hero__sub">Track patterns, practise coping skills and find support at your own pace.</p>
          <div className="ll-hero__actions">
            <Link to="/signup" className="ll-btn ll-btn--primary">Start free</Link>
            <Link to="/#how-it-works" className="ll-btn ll-btn--ghost">See how it works</Link>
          </div>
          <p className="ll-hero__crisis">
            In crisis? Call <a href={`tel:${primaryHelpline.tel}`}>{primaryHelpline.name} {primaryHelpline.phone}</a>
          </p>
        </div>
        <div className="ll-hero__visual" aria-hidden="true">
          <div className="ll-phone">
            <div className="ll-phone__bar"><span>LossLens</span><span>Today</span></div>
            <div className="ll-phone__body">
              <div className="ll-mock-streak"><strong>Today</strong><span>A fresh check-in</span></div>
              <div className="ll-mock-card"><small>Diary</small><p>Notice what happened, without judging yourself.</p></div>
              <div className="ll-mock-chat"><small>Oloo</small><p>Would it help to pause and talk through the urge?</p></div>
            </div>
          </div>
          <span className="ll-visual-orbit" />
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: 'diary', title: 'Diary', body: 'A quick private check-in on moods, triggers and choices.' },
  { icon: 'chat', title: 'Oloo', body: 'An AI companion that can help you reflect, with your consent.' },
  { icon: 'toolkit', title: 'Urge Toolkit', body: 'Simple exercises to help you ride out an urge.' },
  { icon: 'users', title: 'The Circle', body: 'Anonymous peer rooms for support and encouragement.' },
  { icon: 'brain', title: 'CBT Modules', body: 'Short lessons on patterns, thoughts and coping skills.' },
  { icon: 'profile', title: 'Family Portal', body: 'Share selected updates with someone you trust.' },
]

export function WhatYouGet() {
  return (
    <section className="ll-section" id="what-you-get" aria-labelledby="ll-features-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Tools for your pace</p>
        <h2 className="ll-h2" id="ll-features-title">What you get</h2>
        <div className="ll-features">
          {FEATURES.map((feature) => (
            <article className="ll-feature" key={feature.title}>
              <span className="ll-feature__icon"><AppIcon name={feature.icon} size={21} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Check in', body: 'Record what is going on for you, one day at a time.' },
  { title: 'Notice patterns', body: 'Use your reflections to understand triggers and progress.' },
  { title: 'Choose support', body: 'Try a tool, talk to Oloo or connect with peers.' },
]

export function HowItWorks() {
  return (
    <section className="ll-section ll-section--surface" id="how-it-works" aria-labelledby="ll-steps-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Small steps count</p>
        <h2 className="ll-h2" id="ll-steps-title">How it works</h2>
        <div className="ll-steps">
          {STEPS.map((step, index) => (
            <article className="ll-step" key={step.title}>
              <span className="ll-step__number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Privacy() {
  return (
    <section className="ll-section" id="privacy" aria-labelledby="ll-privacy-title">
      <div className="ll-container ll-narrow">
        <p className="ll-eyebrow">Your choices matter</p>
        <h2 className="ll-h2" id="ll-privacy-title">Privacy, in plain language</h2>
        <ul className="ll-promises">
          <li>Your diary is private to you.</li>
          <li>Oloo only uses your chat data with your consent.</li>
          <li>Partners see grouped numbers, not your personal diary or chats.</li>
        </ul>
        <Link to="/privacy" className="ll-text-link">Read our privacy information</Link>
      </div>
    </section>
  )
}

export function CallToAction() {
  return (
    <section className="ll-section ll-start" aria-labelledby="ll-start-title">
      <div className="ll-container ll-start__inner">
        <div>
          <p className="ll-eyebrow">Start when you are ready</p>
          <h2 className="ll-h2" id="ll-start-title">One small step is enough.</h2>
          <p className="ll-lede">Create a private account and begin with a check-in. You can explore at your own pace.</p>
        </div>
        <Link to="/signup" className="ll-btn ll-btn--primary">Create a free account</Link>
      </div>
    </section>
  )
}

export function Crisis() {
  return (
    <section className="ll-section ll-crisis" id="crisis" aria-labelledby="ll-crisis-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Support is available</p>
        <h2 className="ll-h2" id="ll-crisis-title">Need help right now?</h2>
        <p className="ll-lede">These helplines are available without a LossLens account.</p>
        <div className="ll-crisis__list">
          {HELPLINES.map((line) => (
            <a className="ll-crisis__item" href={`tel:${line.tel}`} key={line.id}>
              <span><strong>{line.name}</strong><small>{line.hours}</small></span>
              <span className="ll-crisis__number">{line.phone}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PublicLayout({ children }) {
  return (
    <div className="ll-page">
      <Link className="ll-skip" to="#public-main">Skip to content</Link>
      <Header />
      <div id="public-main">{children}</div>
      <Footer />
    </div>
  )
}
