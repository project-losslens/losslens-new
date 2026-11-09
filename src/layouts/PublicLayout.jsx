import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import { LogoMark } from '../components/Brand'
import ContactIcons from '../components/ContactIcons'
import { roleHome } from '../config/roleHome'
import { useAuthProfile } from '../context/AuthProfileContext'
import '../styles/landing.css'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
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

export function PublicLayout({ children }) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    document.getElementById(id)?.scrollIntoView()
  }, [hash])

  return (
    <div className="ll-landing">
      <Link className="ll-skip" to="#public-main">Skip to content</Link>
      <Header />
      <div id="public-main">{children}</div>
      <Footer />
    </div>
  )
}
