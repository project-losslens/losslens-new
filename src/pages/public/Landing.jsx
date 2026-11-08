import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { roleHome } from '../../config/roleHome'
import { supabase } from "../../lib/supabase";
import '../../styles/landing.css'
import { Header, Hero, Numbers, TheGap, WhatItDoes, HowItWorks, BehindTheApp, ProtectionTeaser, Partners, Privacy, PricingPreview, Origin, Crisis, Contact, Footer } from './landing/Sections'
import { primaryHelpline } from '../../config/helplines'
import { useDocumentTitle } from '../../hooks'


















const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#2DD4BF" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
    <path fill="#7DBDEE" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
    <path fill="#2DD4BF" d="M24 44c5.2 0 10-1.9 13.6-5.1l-6.3-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
    <path fill="#7DBDEE" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.3 5.2C41 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
  </svg>
);

function Landing() {
  useDocumentTitle('Free, private gambling support for Kenya')
  const navigate = useNavigate()
  const [authMode, setAuthMode] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', consent: true })
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [attempts, setAttempts] = useState(0)
  const [cooldown, setCooldown] = useState(false)
  const [cooldownTimer, setCooldownTimer] = useState(0)

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallPrompt(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (showInstallPrompt) { const timer = setTimeout(() => setShowInstallPrompt(false), 15000); return () => clearTimeout(timer) }
  }, [showInstallPrompt])

  useEffect(() => {
    if (!authMode) return
    const handleEsc = (e) => { if (e.key === 'Escape') { setAuthMode(null); setError(''); setFieldErrors({}) } }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [authMode])

  useEffect(() => {
    document.body.style.overflow = authMode ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [authMode])

  useEffect(() => {
    if (!cooldown || cooldownTimer <= 0) return
    const timer = setInterval(() => {
      setCooldownTimer(prev => { if (prev <= 1) { setCooldown(false); setAttempts(0); return 0 } return prev - 1 })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown, cooldownTimer])

  const installPWA = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowInstallPrompt(false)
    setDeferredPrompt(null)
  }

  const openAuth = (mode) => { setError(''); setFieldErrors({}); setAuthMode(mode) }

  const handleGoogleAuth = async () => {
    setError(''); setGoogleLoading(true)
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (googleError) { setError('Google sign-in failed. Please try again.'); setGoogleLoading(false) }
  }

  const validateForm = () => {
    const errors = {}
    if (authMode === 'signup') {
      if (!form.name.trim()) errors.name = 'Name is required'
      if (!form.phone.trim()) errors.phone = 'Phone number is required'
    }
    if (!form.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email'
    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (authMode === 'signup' && !form.consent) errors.consent = 'You must agree to continue'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    setError('')
    if (cooldown) { setError(`Too many attempts. Please wait ${Math.ceil(cooldownTimer / 60)} minutes.`); return }
    if (!validateForm()) return
    setLoading(true)
    try {
      if (authMode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { full_name: form.name, phone: form.phone } }
        })
        if (signUpError) throw signUpError
        if (data.user) {
          await supabase.from('profiles').upsert({ id: data.user.id, full_name: form.name, phone: form.phone, streak_days: 0, risk_level: 'low' })
          navigate('/dashboard')
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (signInError) {
          const newAttempts = attempts + 1; setAttempts(newAttempts)
          if (newAttempts >= 5) { setCooldown(true); setCooldownTimer(300); throw new Error('Too many attempts. Please try again in 5 minutes.') }
          throw signInError
        }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
        navigate(roleHome(profile?.role), { replace: true })
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const formatCooldown = () => { const mins = Math.floor(cooldownTimer / 60); const secs = cooldownTimer % 60; return `${mins}:${secs.toString().padStart(2, '0')}` }

  return (
    <div className="ll-page">
      <a className="ll-skip" href="#main">Skip to content</a>
      {showInstallPrompt && (
        <div role="status" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 'var(--z-modal)', background: 'var(--surface-2)', borderBottom: '2px solid var(--primary)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--primary)', fontSize: '13px' }}>Add LossLens to your home screen for quick access</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowInstallPrompt(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', cursor: 'pointer' }}>Not now</button>
            <button onClick={installPWA} style={{ background: 'var(--primary)', border: 'none', color: 'var(--bg)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Install</button>
          </div>
        </div>
      )}

      <Header onLogin={() => openAuth('login')} onSignup={() => openAuth('signup')} />

      <main id="main">
        <Hero onSignup={() => openAuth('signup')} />
        <Numbers />
        <TheGap />
        <WhatItDoes />
        <HowItWorks />
        <BehindTheApp />
        <ProtectionTeaser />
        <Partners />
        <Privacy />
        <PricingPreview />
        <Origin />
        <Crisis />
        <Contact />
      </main>

      <Footer />

      {authMode && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => { if (e.target === e.currentTarget) { setAuthMode(null); setError(''); setFieldErrors({}) } }}>
          <div className="auth-card">
            <h2 id="modal-title" className="auth-title">{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="auth-sub">{authMode === 'login' ? 'Sign in to your LossLens account' : 'Free to start — no credit card needed'}</p>
            {error && <div role="alert" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', color: '#FFFFFF', fontSize: 13, marginBottom: '1rem' }}>{error}</div>}
            <button onClick={handleGoogleAuth} disabled={googleLoading || loading || cooldown} style={{ width: '100%', padding: '13px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '1.25rem', fontFamily: 'var(--font-body)', opacity: (googleLoading || loading || cooldown) ? 0.7 : 1 }}>
              {googleLoading ? <span className="spinner" style={{ borderColor: '#2DD4BF', borderTopColor: 'transparent' }} /> : <><GoogleIcon /> Continue with Google</>}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}><div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div><span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>or with email</span><div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div></div>
            {authMode === 'signup' && (
              <>
                <div className="form-group"><label>FULL NAME</label><input type="text" placeholder="e.g. Amina Wanjiru" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors(p => ({ ...p, name: '' })) }} style={fieldErrors.name ? { borderColor: '#FFFFFF' } : {}} />{fieldErrors.name && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.name}</span>}</div>
                <div className="form-group"><label>PHONE NUMBER</label><div className="phone-input"><span className="phone-prefix">🇰🇪 +254</span><input type="tel" placeholder="7XX XXX XXX" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors(p => ({ ...p, phone: '' })) }} style={fieldErrors.phone ? { borderColor: '#FFFFFF' } : {}} /></div>{fieldErrors.phone && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.phone}</span>}</div>
              </>
            )}
            <div className="form-group"><label>EMAIL ADDRESS</label><input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors(p => ({ ...p, email: '' })) }} style={fieldErrors.email ? { borderColor: '#FFFFFF' } : {}} />{fieldErrors.email && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.email}</span>}</div>
            <div className="form-group"><label>PASSWORD</label><div style={{ position: 'relative' }}><input type={showPw ? 'text' : 'password'} placeholder="Enter password" value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setFieldErrors(p => ({ ...p, password: '' })) }} style={{ paddingRight: 44, ...(fieldErrors.password ? { borderColor: '#FFFFFF' } : {}) }} onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }} /><button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{showPw ? 'Hide' : 'Show'}</button></div>{fieldErrors.password && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.password}</span>}</div>
            {authMode === 'login' && <p className="forgot" onClick={() => navigate('/forgot-password')}>Forgot password?</p>}
            {authMode === 'signup' && (
              <div className="checkbox-group" style={{ marginBottom: '1rem' }}>
                <input type="checkbox" id="consent" checked={form.consent} onChange={(e) => { setForm({ ...form, consent: e.target.checked }); setFieldErrors(p => ({ ...p, consent: '' })) }} />
                <label htmlFor="consent">I understand this app supports my wellbeing and is not a replacement for professional therapy. <span className="link" onClick={() => navigate('/privacy')}>Privacy Policy</span></label>
                {fieldErrors.consent && <span style={{ fontSize: '11px', color: '#FFFFFF', display: 'block' }}>{fieldErrors.consent}</span>}
              </div>
            )}
            <button className="btn-primary full" onClick={handleSubmit} disabled={loading || cooldown} style={{ opacity: cooldown ? 0.5 : 1 }}>{loading ? <span className="spinner" /> : cooldown ? `Wait ${formatCooldown()}` : authMode === 'login' ? 'Sign In' : 'Create My Account'}</button>
            <p className="auth-switch">{authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}<span onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError(''); setFieldErrors({}) }}>{authMode === 'login' ? 'Sign up free' : 'Sign in'}</span></p>
            <div style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.31)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#FFFFFF', margin: 0 }}>In crisis? Call <a href={`tel:${primaryHelpline.tel}`} style={{ color: '#FFFFFF' }}>{primaryHelpline.name} {primaryHelpline.phone}</a> or <a href="tel:1192" style={{ color: '#FFFFFF' }}>NACADA 1192</a> (24/7 free)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Landing
