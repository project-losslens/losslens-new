import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LogoMark from '../../../components/LogoMark'
import AppIcon from '../../../components/AppIcon'
import { SHOW_PROTECTION } from '../protectionFlag'

const LINKS = [
  { href: '#what-it-does', label: 'What it does' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#partners', label: 'Partners' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#pricing', label: 'Pricing' },
  ...(SHOW_PROTECTION ? [{ href: '/protection', label: 'Protection' }] : []),
]

export default function Header({ onLogin, onSignup }) {
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
          {LINKS.map((l) => (
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
          {LINKS.map((l) => (
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
