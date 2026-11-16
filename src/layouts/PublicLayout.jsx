import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import { LogoMark } from '../components/Brand'
import ContactIcons from '../components/ContactIcons'
import TopographicBackground from '../components/TopographicBackground'
import { mailtoHref, telHref } from '../config/site'
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

function Header() {
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
          {NAV_LINKS.map((item) => (
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
          {NAV_LINKS.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          {actions}
        </nav>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="ll-footer">
      <div className="ll-footer__inner">
        <nav className="ll-footer__links" aria-label="Footer">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/pricing">Pricing</Link>
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

// Floating "Talk to the team" control for public visitors. Opens a small
// panel with the existing email/phone contact mechanisms — it is not a chat
// widget and sends nothing to a server. Signed-in members are pointed at the
// existing support ticket page instead.
function TalkToTeam() {
  const { authStatus, user } = useAuthProfile()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const signedIn = authStatus === 'ready' && Boolean(user)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className="ll-contact-fab" ref={panelRef}>
      {open && (
        <div className="ll-contact-fab__panel" role="dialog" aria-label="Contact LossLens">
          {signedIn ? (
            <>
              <p>Signed in? The fastest route is a support ticket.</p>
              <Link to="/support" className="ll-btn ll-btn--primary" onClick={() => setOpen(false)}>
                Open support
              </Link>
            </>
          ) : (
            <>
              <p>Reach the LossLens team by email or phone.</p>
              <div className="ll-contact-fab__actions">
                <a className="ll-btn ll-btn--primary" href={mailtoHref('Website enquiry')}>Email us</a>
                <a className="ll-btn ll-btn--ghost" href={telHref()}>Call us</a>
              </div>
              <p className="ll-contact-fab__note">Need urgent help? See crisis support at the bottom of the page.</p>
            </>
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
        onClick={() => setOpen((value) => !value)}
      >
        <AppIcon name="mail" size={20} />
        <span>Talk to the team</span>
      </button>
    </div>
  )
}

export function PublicLayout({ children }) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    document.getElementById(id)?.scrollIntoView()
  }, [hash])

  return (
    <div className="ll-landing">
      <TopographicBackground variant="hero" />
      <Link className="ll-skip" to="#public-main">Skip to content</Link>
      <Header />
      <div id="public-main">{children}</div>
      <Footer />
      <TalkToTeam />
    </div>
  )
}
