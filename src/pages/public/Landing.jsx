import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from "../../lib/supabase";
import '../../styles/globals.css'

// Crisis Contacts
const CRISIS_CONTACTS = [
  { name: 'Befrienders Kenya', phone: '0800 722 030', hours: '24/7', priority: true },
  { name: 'NACADA Helpline', phone: '1192', hours: '24/7', priority: false },
  { name: 'ODPC Kenya', phone: '0800 724 000', hours: 'Mon-Fri 8am-5pm', priority: false },
]

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#2DD4BF" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
    <path fill="#7DBDEE" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
    <path fill="#2DD4BF" d="M24 44c5.2 0 10-1.9 13.6-5.1l-6.3-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
    <path fill="#7DBDEE" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.3 5.2C41 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
  </svg>
);

function Landing() {
  const navigate = useNavigate()
  const [authMode, setAuthMode] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', consent: true })
  const [menuOpen, setMenuOpen] = useState(false)
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

  const closeMenu = () => setMenuOpen(false)
  const scrollTo = (id) => { closeMenu(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }

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
        if (profile?.role === 'super_admin') navigate('/super-admin', { replace: true })
        else if (profile?.role === 'admin') navigate('/admin', { replace: true })
        else navigate('/dashboard', { replace: true })
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const formatCooldown = () => { const mins = Math.floor(cooldownTimer / 60); const secs = cooldownTimer % 60; return `${mins}:${secs.toString().padStart(2, '0')}` }

  return (
    <div className="root" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      {showInstallPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500, background: 'rgba(255,255,255,0.12)', borderBottom: '2px solid #2DD4BF', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', animation: 'slideDown 0.3s ease-out' }}>
          <span style={{ color: '#2DD4BF', fontSize: '13px' }}> Add LossLens to your home screen for quick access</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowInstallPrompt(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.4)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', cursor: 'pointer' }}>Not now</button>
            <button onClick={installPWA} style={{ background: '#2DD4BF', border: 'none', color: '#0B1220', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Install</button>
          </div>
        </div>
      )}

      <nav className="navbar" style={{ position: 'relative', flexWrap: 'wrap' }}>
        <span className="logo" onClick={() => scrollTo('hero')} style={{ cursor: 'pointer' }}>LossLens</span>
        <button className="hamburger-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}> {menuOpen ? '' : ''} </button>
        <div className="nav-links desktop-nav">
          <a onClick={() => scrollTo('about')} style={{ color: '#2DD4BF', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>About</a>
          <a onClick={() => scrollTo('features')} style={{ color: '#2DD4BF', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>Features</a>
          <a onClick={() => scrollTo('community')} style={{ color: '#2DD4BF', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>Community</a>
          <a onClick={() => scrollTo('crisis')} style={{ color: '#FFFFFF', fontSize: 13, textDecoration: 'none', cursor: 'pointer', fontWeight: 500 }}>🆘 Crisis Help</a>
          <a onClick={() => scrollTo('contact')} style={{ color: '#2DD4BF', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>Contact</a>
          <button className="nav-ghost" onClick={() => { closeMenu(); setAuthMode('login') }}>Log In</button>
          <button className="nav-btn" onClick={() => { closeMenu(); setAuthMode('signup') }}>Get Started Free</button>
        </div>
        {menuOpen && (
          <>
            <div className="mobile-overlay" onClick={closeMenu} />
            <div className="mobile-menu">
              <a onClick={() => scrollTo('about')}>About</a>
              <a onClick={() => scrollTo('features')}>Features</a>
              <a onClick={() => scrollTo('community')}>Community</a>
              <a onClick={() => scrollTo('crisis')} style={{ color: '#FFFFFF' }}>🆘 Crisis Help</a>
              <a onClick={() => scrollTo('contact')}>Contact</a>
              <hr style={{ borderColor: 'rgba(255,255,255,0.12)', margin: '8px 0' }} />
              <button className="nav-ghost" onClick={() => { closeMenu(); setAuthMode('login') }}>Log In</button>
              <button className="nav-btn" onClick={() => { closeMenu(); setAuthMode('signup') }}>Get Started Free</button>
            </div>
          </>
        )}
      </nav>

      <div id="hero" className="hero">
        <div className="pill">Kenya's first CBT-based gambling support platform</div>
        <h1>Free, private gambling support <em>built for Kenya</em></h1>
        <p className="sub">LossLens combines evidence-based CBT therapy, AI companion support, anonymous peer community, and practical tools to help you understand your patterns, manage urges, and reclaim what matters most.</p>
        <div className="btns">
          <button className="btn-primary" onClick={() => setAuthMode('signup')}>Start for free →</button>
          <a onClick={() => scrollTo('about')} className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Learn more ↓</a>
        </div>
        <p className="trust"> PRIVATE  ·  CBT-BASED  ·  FREE FOREVER</p>
      </div>

      <div className="divider" />

      <div id="about" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="pill">About LossLens</div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: '0.75rem' }}>Built for Kenya. <em>Rooted in science.</em></h1>
          <p className="sub" style={{ maxWidth: 520, margin: '0 auto' }}>Over 78% of Kenyan gambling is sports betting — done via mobile phone, tied to M-Pesa, and driven by unemployment and hope. LossLens was designed from the ground up for this reality.</p>
        </div>
        <div className="features" style={{ maxWidth: 900, margin: '0 auto' }}>
          {[{ icon: '', title: 'Cognitive Behavioural Therapy', desc: 'Eight structured CBT modules guide you through understanding triggers, challenging distorted thinking, and building lasting coping strategies.' }, { icon: '', title: 'AI Companion — Oloo', desc: 'Your personal AI support companion that learns your patterns, remembers your triggers, and offers personalized encouragement when you need it most.' }, { icon: '', title: 'Anonymous Peer Support', desc: 'The Circle connects you with others who understand — anonymously. Share struggles, celebrate wins, and get real-time support during urges.' }, { icon: '', title: 'Privacy-First Design', desc: 'Your diary, mood logs, and conversations are private. Delete your data anytime, no questions asked. Your journey belongs to you.' }].map((c, i) => (<div className="card" key={i}><div className="icon">{c.icon}</div><h3>{c.title}</h3><p>{c.desc}</p></div>))}
        </div>
      </div>

      <div className="divider" />

      <div id="features" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}><div className="pill">Everything you need</div><h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}><em>12 powerful tools</em> for your recovery</h1></div>
        <div className="features" style={{ maxWidth: 960, margin: '0 auto' }}>
          {[{ icon: '', title: 'Daily Gambling Diary', desc: 'Log your day in 2 minutes — mood, triggers, money spent, and coping strategies.' }, { icon: '', title: 'Recovery Dashboard', desc: 'Visualise your patterns. Streak counters, money saved, risk indicators.' }, { icon: '', title: 'CBT Modules', desc: '8 structured lessons with real content, reflections, and progress tracking.' }, { icon: '', title: 'Urge Toolkit', desc: '15-minute urge timer, breathing exercises, thought challenger.' }, { icon: '', title: 'The Circle', desc: 'Anonymous peer support rooms — check-ins, urge support, celebrations.' }, { icon: '', title: 'Whispers', desc: 'Get matched with a peer for private 48-hour anonymous chats.' }, { icon: '', title: 'Events & Workshops', desc: 'RSVP to support groups, workshops, and seminars.' }, { icon: '', title: 'Resource Directory', desc: 'Kenya-specific helplines, self-exclusion tools, financial guides.' }, { icon: '', title: 'Family Portal', desc: 'Invite a trusted supporter. They see only what you choose.' }, { icon: '', title: 'Monthly Mirror', desc: 'Record monthly reflections. Watch your transformation.' }, { icon: '', title: 'LossLens Pact', desc: 'Record a message to your future self.' }, { icon: '', title: 'Profile & Reports', desc: 'Download a professional PDF report for your therapist.' }].map((f, i) => (<div className="card" key={i}><div className="icon">{f.icon}</div><h3>{f.title}</h3><p>{f.desc}</p></div>))}
        </div>
      </div>

      <div className="divider" />

      <div id="community" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}><div className="pill">Community</div><h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>Recovery doesn't happen <em>in isolation</em></h1><p className="sub" style={{ maxWidth: 520, margin: '0 auto' }}>LossLens is the first gambling harm platform built around anonymous peer support.</p></div>
        <div className="features" style={{ maxWidth: 700, margin: '0 auto' }}>
          {[{ icon: '', title: 'The Circle', desc: 'Join anonymous rooms for daily check-ins, real-time urge support, victory celebrations, and slip recovery.' }, { icon: '', title: 'Whispers', desc: 'Get paired with someone who understands. Temporary 48-hour anonymous chats.' }].map((c, i) => (<div className="card" key={i} style={{ textAlign: 'center' }}><div className="icon" style={{ fontSize: '36px' }}>{c.icon}</div><h3>{c.title}</h3><p>{c.desc}</p></div>))}
        </div>
      </div>

      <div className="divider" />

      <div id="crisis" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="pill" style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' }}>🆘 Crisis Support</div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: '0.75rem' }}>You're <em>not alone</em></h1>
          <p className="sub" style={{ maxWidth: 520, margin: '0 auto' }}>If you're feeling overwhelmed, having thoughts of self-harm, or need someone to talk to right now — reach out. These services are free and confidential.</p>
        </div>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {CRISIS_CONTACTS.map((contact, i) => (
            <a key={i} href={`tel:${contact.phone.replace(/\s/g, '')}`} style={{
              textDecoration: 'none', background: contact.priority ? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08))' : 'rgba(255,255,255,0.06)',
              border: contact.priority ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: '14px', padding: contact.priority ? '20px' : '16px',
              display: 'flex', alignItems: 'center', gap: '14px', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'scale(1.01)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = contact.priority ? '#FFFFFF' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'scale(1)' }}>
              <span style={{ fontSize: contact.priority ? '32px' : '24px', flexShrink: 0 }}>{contact.priority ? '⭐' : ''}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ color: contact.priority ? '#FFFFFF' : '#FFFFFF', fontSize: contact.priority ? '16px' : '14px', margin: 0 }}>{contact.name}</h3>
                  {contact.priority && <span style={{ background: '#FFFFFF', color: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 600 }}>First Call</span>}
                </div>
                <p style={{ color: '#2DD4BF', fontSize: '13px', margin: '4px 0 0' }}>{contact.phone}  · {contact.hours}</p>
              </div>
              <span style={{ color: contact.priority ? '#FFFFFF' : 'rgba(255,255,255,0.4)', fontSize: '20px' }}>→</span>
            </a>
          ))}
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>All calls are free, confidential, and available to anyone in Kenya.</p>
        </div>
      </div>

      <div className="divider" />

      <div style={{ padding: '2rem' }}>
        <div className="stats">
          {[{ num: '78%', label: 'of Kenyan gambling is sports betting via mobile' }, { num: '54%', label: 'of gamblers in Kenya are under 35 years old' }, { num: '15 min', label: 'is all it takes for most urges to pass' }, { num: 'Free', label: 'forever for individuals — no hidden fees, ever', highlight: true }].map((s, i) => (<div className="stat" key={i}><span className="stat-num" style={s.highlight ? { background: 'linear-gradient(135deg, #2DD4BF, #7DBDEE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 900 } : {}}>{s.num}</span><span className="stat-label">{s.label}</span></div>))}
        </div>
      </div>

      <div className="divider" />

      <div id="contact" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}><div className="pill">Get In Touch</div><h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>We'd love to <em>hear from you</em></h1><p className="sub" style={{ maxWidth: 480, margin: '0 auto' }}>Have questions, suggestions, or want to partner with us? Reach out anytime.</p></div>
        <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
          <div className="card" style={{ padding: '2rem' }}><div className="icon" style={{ fontSize: '32px' }}></div><h3 style={{ marginBottom: '8px' }}>Email Us</h3><a href="mailto:projectkingsly@gmail.com" style={{ color: '#2DD4BF', fontSize: '16px', textDecoration: 'none', fontFamily: "'Playfair Display', serif", fontWeight: 600 }}>projectkingsly@gmail.com</a><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '8px' }}>We typically respond within 24 hours</p></div>
        </div>
      </div>

      <div className="divider" />

      <div style={{ padding: '2rem' }}>
        <div className="cta-block"><h2>Your journey starts with one step</h2><p>No judgement. No cost. No barriers. LossLens is here whenever you're ready.</p><div className="btns"><button className="btn-primary" onClick={() => setAuthMode('signup')}>Begin for free →</button><a onClick={() => scrollTo('features')} className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>See all features</a></div><p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: '0.75rem' }}>No credit card. No subscription. Just support.</p></div>
      </div>

      <footer className="footer" style={{ flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
        <div><p>LossLens  · Gambling Harm Reduction  · Kenya  · 2026</p><p style={{ fontSize: '11px', marginTop: '4px' }}><a href="mailto:projectkingsly@gmail.com" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>projectkingsly@gmail.com</a></p></div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a onClick={() => navigate('/privacy')} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Privacy Policy</a>
          <a onClick={() => navigate('/terms')} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Terms of Service</a>
          <a onClick={() => scrollTo('crisis')} style={{ color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}>Crisis Help</a>
          <a onClick={() => scrollTo('contact')} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Contact</a>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.31)', borderRadius: '8px', padding: '10px 14px', maxWidth: '500px', margin: '0 auto' }}>
          <p style={{ fontSize: 12, color: '#FFFFFF', margin: 0 }}>
            🆘 <strong>In crisis?</strong> Call <strong style={{ color: '#FFFFFF' }}>Befrienders Kenya 0800 722 030</strong> or <strong>NACADA 1192</strong> (24/7 free)
          </p>
        </div>
      </footer>

      {authMode && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => { if (e.target === e.currentTarget) { setAuthMode(null); setError(''); setFieldErrors({}) } }}>
          <div className="auth-card">
            <h2 id="modal-title" className="auth-title">{authMode === 'login' ? 'Welcome back' : 'Begin your journey'}</h2>
            <p className="auth-sub">{authMode === 'login' ? 'Sign in to your LossLens account' : 'Create a free account — no credit card needed'}</p>
            {error && <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', color: '#FFFFFF', fontSize: 13, marginBottom: '1rem' }}>{error}</div>}
            <button onClick={handleGoogleAuth} disabled={googleLoading || loading || cooldown} style={{ width: '100%', padding: '13px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '1.25rem', fontFamily: "'Inter', sans-serif", opacity: (googleLoading || loading || cooldown) ? 0.7 : 1 }}>
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
            <div className="form-group"><label>PASSWORD</label><div style={{ position: 'relative' }}><input type={showPw ? 'text' : 'password'} placeholder="Enter password" value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setFieldErrors(p => ({ ...p, password: '' })) }} style={{ paddingRight: 44, ...(fieldErrors.password ? { borderColor: '#FFFFFF' } : {}) }} onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }} /><button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{showPw ? '' : ''}</button></div>{fieldErrors.password && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{fieldErrors.password}</span>}</div>
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
              <p style={{ fontSize: 11, color: '#FFFFFF', margin: 0 }}>🆘 <strong>In crisis?</strong> Call <strong style={{ color: '#FFFFFF' }}>Befrienders Kenya 0800 722 030</strong></p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hamburger-btn{display:none;background:none;border:1px solid rgba(255,255,255,0.12);color:#2DD4BF;font-size:22px;padding:6px 12px;border-radius:8px;cursor:pointer;z-index:300}
        .desktop-nav{display:flex}
        .mobile-menu{display:none;position:absolute;top:100%;left:0;right:0;background:rgba(255,255,255,0.06);border-bottom:2px solid rgba(255,255,255,0.12);padding:1rem;z-index:200;flex-direction:column;gap:12px}
        .mobile-menu a{color:#2DD4BF;font-size:14px;text-decoration:none;cursor:pointer;padding:8px 0}
        .mobile-menu button{width:100%}
        .mobile-overlay{display:none;position:fixed;inset:0;z-index:150}
        .modal-overlay{position:fixed;inset:0;background:rgba(11,18,32,0.85);backdropFilter:blur(6px);z-index:200;display:flex;align-items:center;justifyContent:center;padding:20px}
        @keyframes slideDown{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:768px){.hamburger-btn{display:block}.desktop-nav{display:none!important}.mobile-menu{display:flex}.mobile-overlay{display:block}.navbar{justify-content:space-between}.features{grid-template-columns:1fr!important}.stats{grid-template-columns:1fr 1fr!important}.hero{padding:2rem 1rem!important}.hero h1{font-size:1.5rem!important}}
      `}</style>
    </div>
  )
}

export default Landing
