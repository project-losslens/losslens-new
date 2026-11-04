import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'

function ResetPassword() {
  const navigate = useNavigate()
  const redirectTimer = useRef(null)
  const [loading, setLoading] = useState(false)
  const [checkingToken, setCheckingToken] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [strength, setStrength] = useState(0)
  const [success, setSuccess] = useState(false)

  //  Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) {
          setTokenError('This password reset link is invalid or has expired.')
          setTokenValid(false)
        } else {
          setTokenValid(true)
        }
      } catch (err) {
        setTokenError('This password reset link is invalid or has expired. Please request a new one.')
        setTokenValid(false)
      } finally {
        setCheckingToken(false)
      }
    }
    verifyToken()
  }, [])

  //  Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  const calculateStrength = (pw) => {
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw)) score++
    return score
  }

  const strengthInfo = useMemo(() => {
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
    const colors = ['', '#F09595', '#FAC775', '#6ee7b7', '#4CAF50']
    return { label: labels[strength], color: colors[strength], pct: (strength / 4) * 100 }
  }, [strength])

  const requirements = useMemo(() => [
    { met: password.length >= 8, text: 'At least 8 characters' },
    { met: /[a-zA-Z]/.test(password) && /[0-9]/.test(password), text: 'At least one letter and one number' },
    { met: password.length > 0 && password === confirmPassword, text: 'Passwords match' },
  ], [password, confirmPassword])

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { setError('Password must include at least one letter and one number.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      //  Use error code/status instead of brittle message.includes
      if (updateError.status === 422 || updateError.code === 'same_password') {
        setError('New password must be different from your current password.')
      } else {
        setError(updateError.message || 'Failed to update password.')
      }
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
    //  Longer redirect delay, with cleanup
    redirectTimer.current = setTimeout(() => navigate('/login', { replace: true }), 4000)
  }

  const canSubmit = password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password) && password === confirmPassword && !loading

  //  Token checking screen
  if (checkingToken) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid #0a3d22', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}></div>
      </div>
    )
  }

  //  Invalid/expired token
  if (!tokenValid) {
    return (
      <div className="root">
        <nav className="navbar">
          <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
        </nav>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }}>⏰</span>
            <h2 className="auth-title">Link expired</h2>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>{tokenError}</p>
            <button className="btn-primary full" onClick={() => navigate('/forgot-password')}>Request a new link →</button>
          </div>
        </div>
      </div>
    )
  }

  //  Success screen
  if (success) {
    return (
      <div className="root">
        <nav className="navbar">
          <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
        </nav>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }} role="img" aria-label="Success"></span>
            <h2 className="auth-title">Password updated!</h2>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>Your password has been changed. You'll be redirected to the login page.</p>
            <button className="btn-primary full" onClick={() => { if (redirectTimer.current) clearTimeout(redirectTimer.current); navigate('/login') }}>Go to login now →</button>
            <p style={{ color: '#3b7a5a', fontSize: '12px', marginTop: '12px' }}>Redirecting automatically...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root">
      <nav className="navbar">
        <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
        <button className="nav-ghost" onClick={() => navigate('/login')}>â† Log in</button>
      </nav>

      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Reset your password</h2>
          <p className="auth-sub">Choose a strong password you haven't used before.</p>

          {error && <div role="alert" aria-live="polite" style={{ background: '#791F1F', border: '1px solid #F09595', borderRadius: '8px', padding: '10px 14px', color: '#F09595', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="form-group">
              <label htmlFor="password">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Min 8 chars, 1 letter + 1 number"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setStrength(calculateStrength(e.target.value)); if (error) setError('') }}
                  style={{ paddingRight: 44 }}
                  aria-describedby="password-requirements"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#3b7a5a', fontSize: 14, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showPw ? '' : ''}
                </button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ height: '4px', background: '#0a3d22', borderRadius: '2px', overflow: 'hidden', transition: 'width 0.3s ease' }}>
                    <div style={{ width: `${strengthInfo.pct}%`, height: '100%', background: strengthInfo.color, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: strengthInfo.color || '#3b7a5a', marginTop: '4px', display: 'block' }}>{strengthInfo.label || 'Type a password'}</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirmPassword"
                  type={showConfirmPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (error) setError('') }}
                  style={{ paddingRight: 44, ...(confirmPassword && password !== confirmPassword ? { borderColor: '#F09595' } : {}) }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#3b7a5a', fontSize: 14, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showConfirmPw ? '' : ''}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && <span style={{ fontSize: '11px', color: '#F09595' }}>Passwords do not match</span>}
              {confirmPassword && password === confirmPassword && <span style={{ fontSize: '11px', color: '#6ee7b7' }}>Passwords match </span>}
            </div>

            {/* Password Requirements Checklist */}
            <div id="password-requirements" style={{ background: '#041f13', border: '1px solid #1d5c38', borderRadius: '8px', padding: '12px', marginBottom: '1.25rem' }}>
              <p style={{ color: '#3b7a5a', fontSize: '11px', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Requirements</p>
              {requirements.map((req, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px', color: req.met ? '#6ee7b7' : '#3b7a5a' }}>
                  <span style={{ fontSize: '12px', minWidth: '16px' }}>{req.met ? '' : ''}</span>
                  <span>{req.text}</span>
                </div>
              ))}
            </div>

            <button className="btn-primary full" type="submit" disabled={!canSubmit}>
              {loading ? <span className="spinner"></span> : 'Update password'}
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

export default ResetPassword
