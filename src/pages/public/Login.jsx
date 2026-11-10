import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { roleHome, safeInternalPath } from '../../config/roleHome'
import { createSupabaseClient } from '../../lib/supabase'
import { primaryHelpline } from '../../config/helplines'
import { PublicLayout } from '../../layouts/PublicLayout'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useI18n } from '../../i18n'

// Shared Google Icon
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#2DD4BF" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
    <path fill="#7DBDEE" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
    <path fill="#2DD4BF" d="M24 44c5.2 0 10-1.9 13.6-5.1l-6.3-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
    <path fill="#7DBDEE" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.3 5.2C41 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
  </svg>
);

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const emailRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [attempts, setAttempts] = useState(() => parseInt(sessionStorage.getItem('login_attempts') || '0'))
  const [cooldown, setCooldown] = useState(() => sessionStorage.getItem('login_cooldown_until') !== null)
  const [cooldownUntil, setCooldownUntil] = useState(() => parseInt(sessionStorage.getItem('login_cooldown_until') || '0'))
  const [cooldownTimer, setCooldownTimer] = useState(0)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  //  Cooldown timer with localStorage persistence
  useEffect(() => {
    if (!cooldown) return
    const calculateRemaining = () => {
      const now = Date.now()
      const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
      setCooldownTimer(remaining)
      if (remaining <= 0) {
        setCooldown(false)
        setAttempts(0)
        sessionStorage.removeItem('login_attempts')
        sessionStorage.removeItem('login_cooldown_until')
      }
    }
    calculateRemaining()
    const timer = setInterval(calculateRemaining, 1000)
    return () => clearInterval(timer)
  }, [cooldown, cooldownUntil])

  //  Auto-clear error on input change
  const handleEmailChange = (e) => { setEmail(e.target.value); if (error) setError('') }
  const handlePasswordChange = (e) => { setPassword(e.target.value); if (error) setError('') }

  const handleLogin = async (e) => {
    if (e) e.preventDefault()
    setError('')
    if (cooldown) return
    if (!email.trim() || !password) { setError(t('login.errorFields')); return }

    setLoading(true)
    localStorage.setItem('losslens_remember_me', String(rememberMe))
    const loginClient = createSupabaseClient(rememberMe)
    const { data, error: loginError } = await loginClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (loginError) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      sessionStorage.setItem('login_attempts', newAttempts.toString())
      if (newAttempts >= 5) {
        const until = Date.now() + 300000
        setCooldown(true)
        setCooldownUntil(until)
        sessionStorage.setItem('login_cooldown_until', until.toString())
        setError(t('login.errorCooldown'))
      } else {
        setError(t('login.errorCredentials'))
      }
      setLoading(false)
      return
    }

    // Clear rate limit on success
    sessionStorage.removeItem('login_attempts')
    sessionStorage.removeItem('login_cooldown_until')
    setAttempts(0)

    const { data: profile, error: profileError } = await loginClient.from('profiles').select('role').eq('id', data.user.id).single()
    if (profileError) {
      console.error('Could not load profile after sign-in:', profileError)
      setError(t('login.errorProfile'))
      setLoading(false)
      return
    }
    setLoading(false)
    const destination = safeInternalPath(location.state?.from) || roleHome(profile?.role)
    window.location.assign(destination)
  }

  const handleGoogleLogin = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      localStorage.setItem('losslens_remember_me', String(rememberMe))
      const loginClient = createSupabaseClient(rememberMe)
      const { error: googleError } = await loginClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (googleError) {
        setError(t('login.errorGoogle'))
        setGoogleLoading(false)
      }
    } catch (loginError) {
      console.error('Google sign-in failed:', loginError)
      setError(t('login.errorGoogle'))
      setGoogleLoading(false)
    }
  }

  const formatCooldown = useCallback(() => {
    const mins = Math.floor(cooldownTimer / 60)
    const secs = cooldownTimer % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [cooldownTimer])

  return (
    <PublicLayout>
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <LanguageSwitcher />
          </div>
          <h1 className="auth-title">{t('login.title')}</h1>
          <p className="auth-sub">{t('login.subtitle')}</p>

          {error && (
            <div role="alert" aria-live="polite" style={{
              background: cooldown ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${cooldown ? '#2DD4BF' : '#FFFFFF'}`,
              borderRadius: '8px', padding: '10px 14px',
              color: cooldown ? '#2DD4BF' : '#FFFFFF',
              fontSize: '13px', marginBottom: '1rem'
            }}>
              {cooldown ? `${t('login.errorCooldown')} ${t('common.wait', { time: formatCooldown() })}` : error}
            </div>
          )}

          {/* Google Sign-In */}
          <button onClick={handleGoogleLogin} disabled={googleLoading || cooldown} style={{
            width: '100%', padding: '13px', borderRadius: '100px',
            border: '2px solid rgba(255,255,255,0.12)', background: '#FFFFFF',
            color: '#0B1220', fontSize: '14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px', marginBottom: '1.25rem', fontFamily: 'var(--font-body)',
            fontWeight: 500, opacity: (googleLoading || cooldown) ? 0.7 : 1
          }}>
            {googleLoading ? <span className="spinner" /> : <><GoogleIcon /> {t('login.google')}</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{t('login.orEmail')}</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="form-group">
              <label htmlFor="email">{t('login.email')}</label>
              <input ref={emailRef} id="email" type="email" autoComplete="username" placeholder="jane@email.com" value={email} onChange={handleEmailChange} disabled={cooldown} />
            </div>

            <div className="form-group">
              <label htmlFor="password">{t('login.password')}</label>
              <div style={{ position: 'relative' }}>
                <input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder={t('login.passwordPlaceholder')} value={password} onChange={handlePasswordChange} style={{ paddingRight: 44 }} disabled={cooldown} />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{showPw ? t('login.hidePassword') : t('login.showPassword')}</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="remember" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ accentColor: '#2DD4BF', width: '15px', height: '15px', cursor: 'pointer' }} />
                <label htmlFor="remember" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>{t('login.remember')}</label>
              </div>
              <button type="button" className="forgot" onClick={() => navigate('/forgot-password')} style={{ background: 'none', border: 'none', fontSize: '12px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'var(--font-body)', margin: 0, padding: 0 }}>{t('login.forgot')}</button>
            </div>

            <button className="btn-primary full" type="submit" disabled={loading || cooldown} style={{ opacity: cooldown ? 0.5 : 1 }}>
              {loading ? <span className="spinner"></span> : cooldown ? t('login.wait', { time: formatCooldown() }) : t('login.submit')}
            </button>
          </form>

          <p className="auth-switch">{t('login.noAccount')} <Link to="/signup">{t('login.signUp')}</Link></p>
          <p className="auth-switch">{t('login.insurer')} <Link to="/insurer/login">{t('login.insurerLogin')}</Link></p>

          <div style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,0.12)', border: '1px solid #7DBDEE', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#2DD4BF' }}>{t('login.crisis', { name: primaryHelpline.name, phone: primaryHelpline.phone, hours: primaryHelpline.hours })}</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export default Login
