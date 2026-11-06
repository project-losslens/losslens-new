import { useState, useEffect } from 'react'

function SiteGate({ children, sitePassword }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('site_access') === 'true') {
      setAuthenticated(true)
    }
  }, [])

  const handleSubmit = () => {
    if (!sitePassword) {
      setError('Site password not configured')
      return
    }
    if (input === sitePassword) {
      setAuthenticated(true)
      sessionStorage.setItem('site_access', 'true')
      setError('')
    } else {
      setError('Incorrect password')
      setInput('')
    }
  }

  if (authenticated) return children

  return (
    <div style={{
      minHeight: '100vh', background: '#0B1220',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.06)', border: '2px solid #2DD4BF', borderRadius: '16px',
        padding: '2.5rem 2rem', maxWidth: '420px', width: '100%', textAlign: 'center',
      }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} aria-hidden="true"></span>
        <h1 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '24px', marginBottom: '8px' }}>
          LossLens
        </h1>
        <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '24px', lineHeight: '1.6' }}>
          The site is currently in development.
          <br />Enter the access password to continue.
        </p>

        {error && (
          <div role="alert" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px', color: '#FFFFFF', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="Enter password"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            aria-label="Site access password"
            aria-describedby={error ? 'password-error' : undefined}
            aria-invalid={error ? 'true' : 'false'}
            style={{
              width: '100%', padding: '12px 44px 12px 14px', borderRadius: '8px',
              background: '#0B1220', border: '2px solid rgba(255,255,255,0.12)', color: '#FFFFFF',
              fontSize: '14px', outline: 'none', fontFamily: "'Inter', sans-serif",
              textAlign: 'center', letterSpacing: '4px',
            }}
            autoFocus
            onFocus={e => e.target.style.borderColor = '#2DD4BF'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
          />
          <button
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '16px', cursor: 'pointer' }}
          >
            <span aria-hidden="true">{showPw ? '' : ''}</span>
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!input}
          aria-label="Access site"
          style={{
            width: '100%', padding: '12px', borderRadius: '8px',
            background: input ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none',
            color: input ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: 500,
            cursor: input ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif",
          }}
        >
          Access Site
        </button>
      </div>
    </div>
  )
}

export default SiteGate
