import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { primaryHelpline } from '../../config/helplines'
import { PublicLayout } from '../../layouts/PublicLayout'
import AppIcon from '../../components/AppIcon'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#2DD4BF" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
    <path fill="#7DBDEE" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
    <path fill="#2DD4BF" d="M24 44c5.2 0 10-1.9 13.6-5.1l-6.3-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
    <path fill="#7DBDEE" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.3 5.2C41 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
  </svg>
);

function Signup() {
  const [searchParams] = useSearchParams()
  const typeFromUrl = searchParams.get('type') || 'individual'

  const emailRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [signupType, setSignupType] = useState(typeFromUrl === 'company' ? 'company' : 'individual')
  const [companyCode, setCompanyCode] = useState('')
  const [companyValidation, setCompanyValidation] = useState(null)
  const [validatingCode, setValidatingCode] = useState(false)
  const companyValidationRequestRef = useRef(0)
  const [form, setForm] = useState({
    name: '', username: '', phone: '', email: '',
    password: '', confirmPassword: ''
  })
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [signedUp, setSignedUp] = useState(() => sessionStorage.getItem('signup_email') !== null)
  const [signedUpEmail, setSignedUpEmail] = useState(() => sessionStorage.getItem('signup_email') || '')
  const [usernameStatus, setUsernameStatus] = useState('')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [consent, setConsent] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const debounceRef = useRef(null)
  const codeDebounceRef = useRef(null)

  const calculateStrength = useCallback((pw) => {
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw)) score++
    return score
  }, [])

  const strength = useMemo(() => {
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
    const colors = ['', '#FFFFFF', '#7DBDEE', '#2DD4BF', '#2DD4BF']
    return { label: labels[passwordStrength], color: colors[passwordStrength] }
  }, [passwordStrength])

  // Validate company code
  const validateCompanyCode = useCallback(async (code) => {
    if (!code || code.length < 3) {
      setCompanyValidation(null)
      return
    }
    const requestId = ++companyValidationRequestRef.current
    setValidatingCode(true)
    try {
      const { data, error: codeError } = await supabase.rpc('validate_company_code', {
        p_code: code.toUpperCase().trim(),
      })
      if (codeError) throw codeError
      if (requestId !== companyValidationRequestRef.current) return
      setCompanyValidation({
        valid: data?.valid === true,
        company_name: data?.company_name || null,
        seats_remaining: data?.seats_remaining ?? null,
      })
    } catch (err) {
      console.error('Code validation error:', err)
      if (requestId === companyValidationRequestRef.current) {
        setCompanyValidation({ valid: false, validation_error: true })
      }
    } finally {
      if (requestId === companyValidationRequestRef.current) setValidatingCode(false)
    }
  }, [])

  const handleCodeChange = (val) => {
    companyValidationRequestRef.current += 1
    setCompanyCode(val.toUpperCase())
    setCompanyValidation(null)
    setValidatingCode(false)
    if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current)
    if (val.length >= 3) {
      codeDebounceRef.current = setTimeout(() => validateCompanyCode(val), 500)
    } else {
      setCompanyValidation(null)
    }
  }

  // Username check
  const checkUsername = useCallback(async (username) => {
    if (username.length < 3) { setUsernameStatus(''); return }
    setUsernameStatus('checking')
    try {
      const { data, error: checkError } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username.toLowerCase().trim())
        .maybeSingle()
      if (checkError) throw checkError
      setUsernameStatus(data ? 'taken' : 'available')
    } catch (err) {
      console.error('Username check error:', err)
      setUsernameStatus('')
    }
  }, [])

  const handleUsernameChange = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setForm(p => ({ ...p, username: cleaned }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (cleaned.length < 3) { setUsernameStatus(''); return }
    debounceRef.current = setTimeout(() => checkUsername(cleaned), 400)
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current)
  }, [])

  const handlePhoneChange = (val) => {
    const digits = val.replace(/\D/g, '')
    let formatted = digits
    if (digits.length > 3) formatted = digits.slice(0, 3) + ' ' + digits.slice(3, 6)
    if (digits.length > 6) formatted = formatted.slice(0, 7) + ' ' + digits.slice(6, 9)
    setForm(p => ({ ...p, phone: formatted.slice(0, 12) }))
  }

  const handleGoogleSignup = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      const options = { redirectTo: `${window.location.origin}/auth/callback` }
      if (signupType === 'company' && companyValidation?.valid) {
        options.data = { plan_type: 'company', company_code: companyCode }
      }
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options,
      })
      if (googleError) { setError('Google sign-up failed. Please try again.'); setGoogleLoading(false) }
    } catch { setGoogleLoading(false) }
  }

  const validateForm = () => {
    const errors = {}
    if (!form.name.trim()) errors.name = 'Full name is required'
    if (!form.username.trim()) errors.username = 'Username is required'
    else if (form.username.length < 3) errors.username = 'At least 3 characters'
    if (!form.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errors.email = 'Enter a valid email'
    if (!/^\d{3} \d{3} \d{3}$/.test(form.phone) && form.phone.trim()) errors.phone = 'Format: 7XX XXX XXX'
    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 8) errors.password = 'At least 8 characters'
    else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) errors.password = 'Include a letter and a number'
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords don't match"
    if (!ageConfirmed) errors.age = 'You must confirm you are 18 or older'
    if (!consent) errors.consent = 'You must agree to continue'
    if (signupType === 'company' && (!companyCode || !companyValidation?.valid)) {
      errors.company_code = 'A valid company code is required'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    if (!validateForm()) return
    setLoading(true)

    try {
      const userData = {
        full_name: form.name.trim(),
        username: form.username.toLowerCase().trim(),
        phone: form.phone.trim(),
        plan_type: signupType,
      }

      if (signupType === 'company' && companyValidation?.valid) {
        userData.company_code = companyCode.toUpperCase().trim()
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: userData,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Signup failed. Please try again.')

      sessionStorage.setItem('signup_email', form.email)
      if (data.user && data.session) sessionStorage.setItem('losslens_new_signup', data.user.id)
      setSignedUpEmail(form.email)
      setSignedUp(true)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleResendEmail = async () => {
    setResending(true)
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: signedUpEmail })
    if (!resendError) {
      setResendSent(true)
      setTimeout(() => setResendSent(false), 5000)
    }
    setResending(false)
  }

  const canSubmit = form.name.trim() && form.username.trim().length >= 3 && form.email.trim() && form.password.length >= 8 && form.password === form.confirmPassword && ageConfirmed && consent && usernameStatus !== 'taken' && usernameStatus !== 'checking' && !loading && (signupType === 'individual' || (signupType === 'company' && companyValidation?.valid))

  // Success screen
  if (signedUp) {
    return (
      <PublicLayout>
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <AppIcon name="mail" size={56} style={{ display: 'block', margin: '0 auto 16px', color: '#7DBDEE' }} />
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub" style={{ lineHeight: '1.6' }}>We've sent a confirmation link to <strong style={{ color: '#2DD4BF' }}>{signedUpEmail}</strong></p>
            {signupType === 'company' && companyValidation?.company_name && (
              <p style={{ color: '#2DD4BF', fontSize: '13px', marginTop: '8px' }}>
                 Linked to <strong>{companyValidation.company_name}</strong>
              </p>
            )}
            <p style={{ color: '#2DD4BF', fontSize: '13px', margin: '16px 0', lineHeight: '1.6' }}>Click the link in the email to activate your account. Then come back here to log in.</p>
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '8px', padding: '12px', marginBottom: '20px', border: '1px solid #2DD4BF' }}>
              <p style={{ color: '#2DD4BF', fontSize: '13px', fontWeight: 600, margin: '0 0 4px' }}> Didn't receive it?</p>
              <p style={{ color: '#2DD4BF', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>Check your <strong>spam/junk folder</strong>. Some email providers filter automated messages.</p>
            </div>
            <Link className="btn-primary full" to="/login">Go to login</Link>
            <button onClick={handleResendEmail} disabled={resending || resendSent} style={{ width: '100%', marginTop: '10px', padding: '10px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: resendSent ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {resendSent ? ' Sent!' : resending ? 'Sending...' : 'Resend email'}
            </button>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">
            {signupType === 'company'
              ? 'Create your account with your company code for subsidized access.'
              : 'Create a free account — no credit card needed.'}
          </p>

          {error && <div role="alert" aria-live="polite" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}

          {/* Plan Type Toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1.25rem' }}>
            <button
              onClick={() => { setSignupType('individual'); setCompanyCode(''); setCompanyValidation(null); setFieldErrors(p => ({ ...p, company_code: '' })) }}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: signupType === 'individual' ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)',
                background: signupType === 'individual' ? 'rgba(45,212,191,0.15)' : 'transparent',
                color: signupType === 'individual' ? '#2DD4BF' : 'rgba(255,255,255,0.4)',
                fontSize: '12px', fontWeight: signupType === 'individual' ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s'
              }}>
               Individual
            </button>
            <button
              onClick={() => setSignupType('company')}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: signupType === 'company' ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)',
                background: signupType === 'company' ? 'rgba(45,212,191,0.15)' : 'transparent',
                color: signupType === 'company' ? '#2DD4BF' : 'rgba(255,255,255,0.4)',
                fontSize: '12px', fontWeight: signupType === 'company' ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s'
              }}>
               Company
            </button>
          </div>

          {/* Google Sign-Up */}
          <button onClick={handleGoogleSignup} disabled={googleLoading} style={{
            width: '100%', padding: '13px', borderRadius: '100px',
            border: '2px solid rgba(255,255,255,0.12)', background: '#FFFFFF',
            color: '#0B1220', fontSize: '14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px', marginBottom: '1.25rem', fontFamily: 'var(--font-body)',
            fontWeight: 500, opacity: googleLoading ? 0.7 : 1
          }}>
            {googleLoading ? <span className="spinner" /> : <><GoogleIcon /> Continue with Google</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>or sign up with email</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Company Code Field — only for company signup */}
            {signupType === 'company' && (
              <div className="form-group">
                <label htmlFor="companyCode">COMPANY CODE *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="companyCode"
                    type="text"
                    placeholder="e.g. AARXYZ"
                    value={companyCode}
                    onChange={e => handleCodeChange(e.target.value)}
                    style={{
                      ...(fieldErrors.company_code ? { borderColor: '#FFFFFF' } : {}),
                      ...(companyValidation?.valid ? { borderColor: '#2DD4BF' } : {}),
                      paddingRight: 80
                    }}
                    aria-invalid={!!fieldErrors.company_code}
                  />
                  {validatingCode && <AppIcon name="clock" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#7DBDEE' }} />}
                  {!validatingCode && companyValidation?.valid && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#2DD4BF', fontSize: '12px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}><AppIcon name="check" size={14} />Valid</span>
                  )}
                  {!validatingCode && companyValidation && !companyValidation.valid && !companyValidation.validation_error && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF', fontSize: '12px' }}>Invalid</span>
                  )}
                </div>
                {companyValidation?.valid && (
                  <span style={{ fontSize: '11px', color: '#2DD4BF' }}>
                    {companyValidation.company_name} — {companyValidation.seats_remaining === null ? 'Unlimited seats' : `${companyValidation.seats_remaining} seats available`}
                  </span>
                )}
                {companyValidation?.validation_error && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>Could not verify this code. Please try again.</span>}
                {companyValidation && !companyValidation.valid && !companyValidation.validation_error && (
                  <span style={{ fontSize: '11px', color: '#FFFFFF' }}>Invalid company code. Check with your employer.</span>
                )}
                {fieldErrors.company_code && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.company_code}</span>}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="name">FULL NAME *</label>
              <input id="name" type="text" autoComplete="name" required placeholder="e.g. Amina Wanjiru" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFieldErrors(p => ({ ...p, name: '' })) }} style={fieldErrors.name ? { borderColor: '#FFFFFF' } : {}} aria-invalid={!!fieldErrors.name} />
              {fieldErrors.name && <span id="name-error" style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="username">USERNAME *</label>
              <div style={{ position: 'relative' }}>
                <input id="username" type="text" autoComplete="username" required placeholder="e.g. amina_w" value={form.username} onChange={e => handleUsernameChange(e.target.value)} style={{ paddingRight: 40, ...(fieldErrors.username ? { borderColor: '#FFFFFF' } : {}) }} />
                {usernameStatus === 'checking' && <AppIcon name="clock" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#7DBDEE' }} />}
                {usernameStatus === 'available' && <AppIcon name="check" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#2DD4BF' }} />}
                {usernameStatus === 'taken' && <AppIcon name="close" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF' }} />}
              </div>
              {usernameStatus === 'taken' && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>Username already taken</span>}
              {usernameStatus === 'available' && <span style={{ fontSize: '11px', color: '#2DD4BF' }}>Username available!</span>}
              {fieldErrors.username && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.username}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="phone">PHONE NUMBER (optional)</label>
              <div className="phone-input">
                <span className="phone-prefix">🇰🇪 +254</span>
                <input id="phone" type="tel" autoComplete="tel" placeholder="7XX XXX XXX" value={form.phone} onChange={e => { handlePhoneChange(e.target.value); setFieldErrors(p => ({ ...p, phone: '' })) }} style={fieldErrors.phone ? { borderColor: '#FFFFFF' } : {}} />
              </div>
              {fieldErrors.phone && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.phone}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email">EMAIL ADDRESS *</label>
              <input id="email" ref={emailRef} type="email" autoComplete="email" required placeholder="you@example.com" value={form.email} onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setFieldErrors(p => ({ ...p, email: '' })) }} style={fieldErrors.email ? { borderColor: '#FFFFFF' } : {}} />
              {fieldErrors.email && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">PASSWORD *</label>
              <div style={{ position: 'relative' }}>
                <input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password" required placeholder="Min 8 chars, 1 letter + 1 number" value={form.password} onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setPasswordStrength(calculateStrength(e.target.value)); setFieldErrors(p => ({ ...p, password: '' })) }} style={{ paddingRight: 44, ...(fieldErrors.password ? { borderColor: '#FFFFFF' } : {}) }} />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
              {form.password.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    {[1, 2, 3, 4].map(level => (
                      <div key={level} style={{ flex: 1, height: '4px', borderRadius: '2px', background: passwordStrength >= level ? (passwordStrength === 4 ? '#2DD4BF' : strength.color) : 'rgba(255,255,255,0.12)', transition: 'background 0.3s ease' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '11px', color: passwordStrength === 4 ? '#2DD4BF' : (strength.color || 'rgba(255,255,255,0.4)') }}>{passwordStrength === 4 ? 'Strong ' : (strength.label || 'Type a password')}</span>
                </div>
              )}
              {fieldErrors.password && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">CONFIRM PASSWORD *</label>
              <div style={{ position: 'relative' }}>
                <input id="confirmPassword" type={showConfirmPw ? 'text' : 'password'} autoComplete="new-password" required placeholder="Re-enter your password" value={form.confirmPassword} onChange={e => { setForm(p => ({ ...p, confirmPassword: e.target.value })); setFieldErrors(p => ({ ...p, confirmPassword: '' })) }} style={{ paddingRight: 44, ...(fieldErrors.confirmPassword ? { borderColor: '#FFFFFF' } : {}) }} />
                <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} aria-label={showConfirmPw ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '10px 12px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{showConfirmPw ? 'Hide' : 'Show'}</button>
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>Passwords don't match</span>}
              {form.confirmPassword && form.password === form.confirmPassword && <span style={{ fontSize: '11px', color: '#2DD4BF' }}>Passwords match </span>}
              {fieldErrors.confirmPassword && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.confirmPassword}</span>}
            </div>

            <div className="checkbox-group" style={{ marginBottom: '0.5rem' }}>
              <input type="checkbox" id="age" checked={ageConfirmed} onChange={e => { setAgeConfirmed(e.target.checked); setFieldErrors(p => ({ ...p, age: '' })) }} required />
              <label htmlFor="age">I confirm I am <strong style={{ color: '#2DD4BF' }}>18 years or older</strong></label>
              {fieldErrors.age && <span style={{ fontSize: '11px', color: '#FFFFFF', display: 'block' }}>{fieldErrors.age}</span>}
            </div>

            <div className="checkbox-group" style={{ marginBottom: '1rem' }}>
              <input type="checkbox" id="consent" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              <label htmlFor="consent">I understand this app supports my wellbeing and is not a replacement for professional therapy. <Link to="/privacy">Privacy Policy</Link></label>
              {fieldErrors.consent && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.consent}</span>}
            </div>

            <button className="btn-primary full" type="submit" disabled={!canSubmit}>
              {loading ? <span className="spinner" /> : signupType === 'company' ? 'Create Company Account' : 'Create My Account'}
            </button>
          </form>

          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>

          <p style={{ color: '#7DBDEE', fontSize: '11px', textAlign: 'center', marginTop: '0.75rem' }}>
             Your data is private and never sold. You can delete everything anytime.
          </p>

          <div style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,0.12)', border: '1px solid #7DBDEE', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#2DD4BF' }}>In crisis? Call {primaryHelpline.name}: <a href={`tel:${primaryHelpline.tel}`}>{primaryHelpline.phone}</a> ({primaryHelpline.hours})</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export default Signup
