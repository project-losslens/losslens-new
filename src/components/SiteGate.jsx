// TEMPORARY site gate — delete this file, the <SiteGate> wrapper in
// src/main.jsx, the robots meta tag in index.html and VITE_SITE_GATE to remove.
// See docs/SITE_GATE.md.
/* eslint-disable react-refresh/only-export-components -- temp gate helpers are exported for tests */
import { useRef, useState } from 'react'
import LogoMark from './LogoMark.jsx'

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
    setError('Incorrect password')
    form.reset()
    if (attempts.current >= 3) {
      setCooldown(true)
      setTimeout(() => setCooldown(false), 1000)
      attempts.current = 0
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#0B1220',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', zIndex: 99999,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%', maxWidth: '360px', background: '#171E2B',
          borderRadius: '16px', padding: '2.5rem 2rem', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <LogoMark size={72} />
        </div>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
          Loss<span style={{ color: '#2DD4BF' }}>Lens</span>
        </h1>
        <p style={{ margin: '0.5rem 0 1.75rem', color: '#9AA7BD', fontSize: '0.9rem' }}>
          Private preview - enter the access password
        </p>
        <label htmlFor="site-gate-password" style={{ position: 'absolute', left: '-9999px' }}>
          Access password
        </label>
        <input
          id="site-gate-password"
          name="password"
          type="password"
          autoFocus
          autoComplete="off"
          disabled={cooldown}
          aria-describedby="site-gate-error"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem',
            borderRadius: '10px', border: '1px solid #2A3550', background: '#0B1220',
            color: '#fff', fontSize: '1rem', marginBottom: '0.75rem',
          }}
        />
        <button
          type="submit"
          disabled={cooldown}
          style={{
            width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: 'none',
            background: '#2DD4BF', color: '#0B1220', fontSize: '1rem', fontWeight: 600,
            cursor: cooldown ? 'not-allowed' : 'pointer', opacity: cooldown ? 0.6 : 1,
          }}
        >
          Enter
        </button>
        <p
          id="site-gate-error"
          aria-live="polite"
          style={{
            minHeight: '1.25rem', margin: '0.75rem 0 0', color: '#F87171',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </p>
      </form>
    </div>
  )
}
