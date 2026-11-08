// TEMPORARY site gate — delete this file, its css import, the <SiteGate>
// wrapper in src/main.jsx, the robots meta tag in index.html and
// VITE_SITE_GATE to remove. See docs/SITE_GATE.md.
/* eslint-disable react-refresh/only-export-components -- temp gate helpers are exported for tests */
import { useRef, useState } from 'react'
import { LogoMark } from './Brand.jsx'
import ContactIcons from './ContactIcons.jsx'
import { primaryHelpline } from '../config/helplines'

export const SITE_GATE_EXPECTED_HASH = 'f91ff1d36becc41df298e7b9944c033146e14688dea6933050a86030a0b33454'
const UNLOCK_KEY = 'll_site_unlocked'

export const SITE_GATE_ENABLED = import.meta.env?.VITE_SITE_GATE !== 'off'

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function siteGatePasswordMatches(input, expectedHash = SITE_GATE_EXPECTED_HASH) {
  return (await sha256Hex(String(input ?? '').trim().toLowerCase())) === expectedHash
}

function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export default function SiteGate({ children }) {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const attempts = useRef(0)

  if (!SITE_GATE_ENABLED || unlocked) return children

  async function onSubmit(event) {
    event.preventDefault()
    if (cooldown) return
    const form = event.currentTarget
    const input = form.elements.password.value
    if (await siteGatePasswordMatches(input)) {
      try {
        localStorage.setItem(UNLOCK_KEY, '1')
      } catch { /* storage unavailable */ }
      setUnlocked(true)
      return
    }
    attempts.current += 1
    setError('That password is not right.')
    form.reset()
    if (attempts.current >= 3) {
      setCooldown(true)
      setTimeout(() => setCooldown(false), 1000)
      attempts.current = 0
    }
  }

  return (
    <div className="sg-root">
      <div className="sg-glow sg-glow--teal" aria-hidden="true" />
      <div className="sg-glow sg-glow--blue" aria-hidden="true" />
      <LogoMark size={480} className="sg-motif" petalClass="" aria-hidden="true" />
      <form className="sg-card" onSubmit={onSubmit}>
        <span className="sg-chip">Under development</span>
        <div className="sg-logo"><LogoMark size={64} /></div>
        <h1 className="sg-title">We&rsquo;re still building <span className="sg-lens">LossLens</span></h1>
        <p className="sg-sub">
          LossLens is a free, private recovery companion for people affected by betting in Kenya.
          The site is not open to the public yet. If you were given access, enter the password below.
        </p>
        <div className="sg-field">
          <label htmlFor="site-gate-password" style={{ position: 'absolute', left: '-9999px' }}>Access password</label>
          <input
            id="site-gate-password"
            name="password"
            type={showPw ? 'text' : 'password'}
            className="sg-input"
            autoFocus
            autoComplete="off"
            disabled={cooldown}
            aria-describedby="site-gate-error"
          />
          <button type="button" className="sg-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
        <button type="submit" className="sg-submit" disabled={cooldown}>Enter</button>
        <p id="site-gate-error" aria-live="polite" className="sg-error">{error}</p>
        <p className="sg-access">
          Need access?
          <ContactIcons subject="Access request" size={18} tone="on-dark" />
        </p>
        <p className="sg-crisis">
          In crisis? Call{' '}
          <a href={`tel:${primaryHelpline.tel}`}>{primaryHelpline.name} {primaryHelpline.phone}</a>{' '}
          — free, 24/7.
        </p>
      </form>
    </div>
  )
}
