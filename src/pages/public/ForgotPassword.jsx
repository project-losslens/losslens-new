import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function ForgotPassword() {
  const navigate = useNavigate()
  const emailRef = useRef(null)
  const countdownRef = useRef(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [resending, setResending] = useState(false)

  //  Auto-focus email on mount
  useEffect(() => {
    if (emailRef.current) emailRef.current.focus()
  }, [])

  //  Countdown with proper cleanup
  useEffect(() => {
    if (countdown <= 0) {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      return
    }
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    }
  }, [countdown])

  //  Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Please enter your email address.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Enter a valid email address.'); return }

    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) {
      setError('Failed to send reset link. Please try again.')
      setLoading(false)
      return
    }
    setSent(true)
    setCountdown(60)
    setLoading(false)
  }

  const handleResend = async () => {
    if (countdown > 0 || resending) return
    setResending(true)
    setError('')
    try {
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resendError) throw resendError
      setCountdown(60)
    } catch (err) {
      setError('Failed to resend. Please try again.')
    } finally {
      setResending(false)
    }
  }

  const handleDifferentEmail = () => {
    setSent(false)
    setEmail('')
    setCountdown(0)
    setError('')
    setTimeout(() => emailRef.current?.focus(), 100)
  }

  const formatCountdown = () => {
    const mins = Math.floor(countdown / 60)
    const secs = countdown % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
  }

  if (sent) {
    return (
      <div className="root">
        <nav className="navbar">
          <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
          <button className="nav-ghost" onClick={() => navigate('/login')}>â"   Back to login</button>
        </nav>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }} aria-label="Email sent"></span>
            <h2 className="auth-title">Check your inbox</h2>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>
              We've sent password reset instructions to <strong style={{ color: '#2DD4BF' }}>{email}</strong>
            </p>
            <p style={{ color: '#2DD4BF', fontSize: '13px', margin: '16px 0', lineHeight: '1.6' }}>
              Click the link in the email to reset your password. The link expires in 60 minutes.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '8px', padding: '12px', marginBottom: '20px', border: '1px solid #2DD4BF' }}>
              <p style={{ color: '#2DD4BF', fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}> Didn't receive it?</p>
              <p style={{ color: '#2DD4BF', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>Check your <strong>spam/junk folder</strong>. Sometimes our emails end up there.</p>
            </div>

            {error && <div role="alert" aria-live="polite" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}

            <button onClick={handleResend} disabled={countdown > 0 || resending} style={{ width: '100%', padding: '13px', borderRadius: '100px', background: countdown > 0 ? 'rgba(255,255,255,0.12)' : '#2DD4BF', border: 'none', color: countdown > 0 ? 'rgba(255,255,255,0.4)' : '#0B1220', fontSize: '14px', fontWeight: 600, cursor: countdown > 0 ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", marginBottom: '10px' }}>
              {resending ? 'Sending...' : countdown > 0 ? `Resend in ${formatCountdown()}` : 'Resend email'}
            </button>

            <button onClick={handleDifferentEmail} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", textDecoration: 'underline' }}>
              Entered wrong email? Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root">
      <nav className="navbar">
        <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
        <button className="nav-ghost" onClick={() => navigate('/login')}>â"   Log in</button>
      </nav>

      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Forgot password?</h2>
          <p className="auth-sub">Enter your email and we'll send you a reset link.</p>

          {error && <div role="alert" aria-live="polite" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="jane@email.com"
                value={email}
                onChange={e => { setEmail(e.target.value); if (error) setError('') }}
              />
            </div>

            <button className="btn-primary full" type="submit" disabled={loading}>
              {loading ? <span className="spinner"></span> : 'Send reset link'}
            </button>
          </form>

          <p className="auth-switch" style={{ marginTop: '1.25rem' }}>
            Remember your password?{' '}
            <span onClick={() => navigate('/login')}>Log in</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
