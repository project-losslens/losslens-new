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
      minHeight: '100vh', background: '#041f13',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: '#062616', border: '2px solid #f59e0b', borderRadius: '16px',
        padding: '2.5rem 2rem', maxWidth: '420px', width: '100%', textAlign: 'center',
      }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} aria-hidden="true"></span>
        <h1 style={{ color: '#f59e0b', fontFamily: "'Playfair Display', serif", fontSize: '24px', marginBottom: '8px' }}>
          LossLens
        </h1>
        <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '24px', lineHeight: '1.6' }}>
          The site is currently in development.
          <br />Enter the access password to continue.
        </p>

        {error && (
          <div role="alert" style={{ background: '#791F1F', border: '1px solid #F09595', borderRadius: '8px', padding: '10px', color: '#F09595', fontSize: '13px', marginBottom: '16px' }}>
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
              background: '#041f13', border: '2px solid #0a3d22', color: '#fff',
              fontSize: '14px', outline: 'none', fontFamily: "'Inter', sans-serif",
              textAlign: 'center', letterSpacing: '4px',
            }}
            autoFocus
            onFocus={e => e.target.style.borderColor = '#f59e0b'}
            onBlur={e => e.target.style.borderColor = '#0a3d22'}
          />
          <button
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#3b7a5a', fontSize: '16px', cursor: 'pointer' }}
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
            background: input ? '#f59e0b' : '#0a3d22', border: 'none',
            color: input ? '#041f13' : '#3b7a5a', fontSize: '14px', fontWeight: 500,
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
