import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import { LogoMark } from '../components/Brand'
import ContactIcons from '../components/ContactIcons'
import TopographicBackground from '../components/TopographicBackground'
import { supabase } from '../lib/supabase'
import { roleHome } from '../config/roleHome'
import { useAuthProfile } from '../context/AuthProfileContext'
import '../styles/landing.css'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/#features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#oloo', label: 'Oloo' },
  { to: '/protection', label: 'Protection' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/#crisis-help', label: 'Crisis help' },
]

const HOME_NAV_LINKS = [
  { to: '/#features', label: 'How we can help' },
  { to: '/#how-it-works', label: 'Your self-check' },
  { to: '/protection', label: 'Protection' },
  { to: '/about', label: 'About' },
  { to: '/#crisis-help', label: 'Human support' },
]

function Header({ home = false }) {
  const navLinks = home ? HOME_NAV_LINKS : NAV_LINKS
  const { pathname } = useLocation()
  const { authStatus, user, role } = useAuthProfile()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const signedIn = authStatus === 'ready' && Boolean(user)
  const dashboardPath = roleHome(role)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  const actions = signedIn ? (
    <Link className="ll-btn ll-btn--primary" to={dashboardPath}>Open dashboard</Link>
  ) : (
    <>
      <Link className="ll-header__login" to="/login">Log in</Link>
      <Link className="ll-btn ll-btn--primary" to="/signup">Get started</Link>
    </>
  )

  return (
    <header className={`ll-header${scrolled ? ' ll-header--solid' : ''}`}>
      <div className="ll-header__inner">
        <Link to="/" className="ll-brand" aria-label="LossLens home">
          <LogoMark size={30} petalClass="" />
          <span>Loss<span className="ll-brand__lens">Lens</span></span>
        </Link>
        <nav className="ll-nav" aria-label="Primary">
          {navLinks.map((item) => (
            <Link key={item.label} to={item.to} aria-current={pathname === item.to ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
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
          {navLinks.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          {actions}
        </nav>
      )}
    </header>
  )
}

function Footer({ home = false }) {
  return (
    <footer className="ll-footer">
      <div className="ll-footer__inner">
        <nav className="ll-footer__links" aria-label="Footer">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/pricing" id={home ? 'pricing' : undefined}>Pricing</Link>
          <Link to="/protection">Protection</Link>
          <Link to="/protection/medical-rider">Medical Rider</Link>
          <Link to="/protection/individual-cover">Individual Cover</Link>
          <Link to="/protection/group-cover">Group Cover</Link>
          <Link to="/protection/actuarial">Actuarial approach</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/about">About</Link>
          <Link to="/partners#insurers">For insurers</Link>
          <Link to="/partners#therapists">For therapists</Link>
        </nav>
        <ContactIcons tone="on-dark" subject="Footer enquiry" />
        <p>LossLens is not an insurance company.</p>
        <small>© 2026 LossLens · Gambling harm reduction · Kenya</small>
      </div>
    </footer>
  )
}

function TalkToTeam() {
  const { authStatus, user, role } = useAuthProfile()
  const [open, setOpen] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const signedIn = authStatus === 'ready' && Boolean(user)

  const submitRequest = async (event) => {
    event.preventDefault()
    if (saving) return
    const input = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const { data, error: requestError } = await supabase.rpc('support_submit_request', {
        p_subject: input.get('subject'),
        p_category: 'other',
        p_body: input.get('body'),
        p_email: input.get('email'),
      })
      if (requestError || !data) {
        setError(requestError?.message === 'Too many requests. Please try again later.'
          ? requestError.message : 'Could not confirm your message was sent. Please try again.')
        return
      }
      setReceipt(data)
      setOpen(false)
      buttonRef.current?.focus()
    } catch {
      setError('Could not confirm your message was sent. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (!saving && event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClick = (event) => {
      if (!saving && panelRef.current && !panelRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, saving])

  return (
    <div className="ll-contact-fab" ref={panelRef}>
      <div role="status">
        {!open && receipt && <div className="ll-contact-fab__panel">
          <p>Message sent. Your ticket is <strong>{receipt}</strong>. Keep this number for follow-up. We’ll review your request.</p>
          <button type="button" className="ll-btn ll-btn--ghost" onClick={() => { setReceipt(''); buttonRef.current?.focus() }}>Dismiss</button>
        </div>}
      </div>
      {open && (
        <div id="ll-contact-panel" className="ll-contact-fab__panel" role="dialog" aria-label="Contact LossLens">
          {signedIn && role === 'user' ? (
            <>
              <p>Send a message and track it from your support page.</p>
              <Link to="/support" className="ll-btn ll-btn--primary" onClick={() => setOpen(false)}>
                Open support
              </Link>
            </>
          ) : (
            <form className="portal-form" onSubmit={submitRequest}>
              <p>Send a message to the LossLens team. This form is not for emergencies.</p>
              <p className="ll-contact-fab__note">Do not include passwords or payment details.</p>
              {!signedIn && <label>Email for follow-up<input type="email" name="email" autoComplete="email" maxLength={254} required /></label>}
              <label>Subject<input name="subject" minLength={3} maxLength={160} required /></label>
              <label>Message<textarea name="body" maxLength={4000} rows={4} required /></label>
              {error && <p role="alert">{error}</p>}
              <button className="ll-btn ll-btn--primary" disabled={saving}>{saving ? 'Sending…' : 'Send message'}</button>
            </form>
          )}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="ll-contact-fab__button"
        aria-expanded={open}
        aria-controls="ll-contact-panel"
        aria-label="Talk to the LossLens team"
        disabled={saving}
        onClick={() => { setError(''); setOpen((value) => !value) }}
      >
        <AppIcon name="mail" size={20} />
        <span>Talk to the team</span>
      </button>
    </div>
  )
}

export function PublicLayout({ children, home = false }) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    const target = document.getElementById(id)
    target?.scrollIntoView()
    if (home && target) {
      if (!target.matches('a, button, input, select, textarea, summary')) target.tabIndex = -1
      target.focus({ preventScroll: true })
    }
  }, [hash, home])

  return (
    <div className={`ll-landing${home ? ' ll-homepage' : ''}`}>
      <TopographicBackground variant="hero" />
      <Link className="ll-skip" to="#public-main">Skip to content</Link>
      <Header home={home} />
      <div id="public-main" tabIndex={home ? -1 : undefined}>{children}</div>
      <Footer home={home} />
      <TalkToTeam />
    </div>
  )
}
