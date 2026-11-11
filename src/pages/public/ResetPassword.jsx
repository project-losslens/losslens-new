import { BrandLoader } from '../../components/Brand'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PublicLayout } from '../../layouts/PublicLayout'
import AppIcon from '../../components/AppIcon'

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
      } catch {
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
    const colors = ['', '#FFFFFF', '#7DBDEE', '#2DD4BF', '#2DD4BF']
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
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BrandLoader />
      </div>
    )
  }

  //  Invalid/expired token
  if (!tokenValid) {
    return (
      <PublicLayout>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }}><AppIcon name="clock" size={40} style={{ display: 'block', margin: '0 auto 16px', color: '#7DBDEE' }} /></span>
            <h1 className="auth-title">Link expired</h1>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>{tokenError}</p>
            <Link className="btn-primary full" to="/forgot-password">Request a new link</Link>
          </div>
        </div>
      </PublicLayout>
    )
  }

  //  Success screen
  if (success) {
    return (
      <PublicLayout>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <AppIcon name="check" size={56} style={{ display: 'block', margin: '0 auto 16px', color: '#2DD4BF' }} />
            <h1 className="auth-title">Password updated!</h1>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>Your password has been changed. You'll be redirected to the login page.</p>
            <button className="btn-primary full" onClick={() => { if (redirectTimer.current) clearTimeout(redirectTimer.current); navigate('/login') }}>Go to login now</button>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '12px' }}>Redirecting automatically...</p>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-sub">Choose a strong password you haven't used before.</p>

          {error && <div role="alert" aria-live="polite" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}

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
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', overflow: 'hidden', transition: 'width 0.3s ease' }}>
                    <div style={{ width: `${strengthInfo.pct}%`, height: '100%', background: strengthInfo.color, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: strengthInfo.color || 'rgba(255,255,255,0.4)', marginTop: '4px', display: 'block' }}>{strengthInfo.label || 'Type a password'}</span>
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
                  style={{ paddingRight: 44, ...(confirmPassword && password !== confirmPassword ? { borderColor: '#FFFFFF' } : {}) }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showConfirmPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>Passwords do not match</span>}
              {confirmPassword && password === confirmPassword && <span style={{ fontSize: '11px', color: '#2DD4BF' }}>Passwords match </span>}
            </div>

            {/* Password Requirements Checklist */}
            <div id="password-requirements" style={{ background: '#0B1220', border: '1px solid #7DBDEE', borderRadius: '8px', padding: '12px', marginBottom: '1.25rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Requirements</p>
              {requirements.map((req, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px', color: req.met ? '#2DD4BF' : 'rgba(255,255,255,0.4)' }}>
                  <span style={{ fontSize: '12px', minWidth: '16px' }}>{req.met ? '' : ''}</span>
                  <span>{req.text}</span>
                </div>
              ))}
            </div>

            <button className="btn-primary full" type="submit" disabled={!canSubmit}>
              {loading ? <BrandLoader variant="inline" showWordmark={false} /> : 'Update password'}
            </button>
          </form>

          <p className="auth-switch" style={{ marginTop: '1.25rem' }}>
            Remember your password?{' '}
            <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  )
}

export default ResetPassword
