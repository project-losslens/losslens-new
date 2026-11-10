import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AIChat from '../../components/AIChat'
import NotificationBell from '../../components/NotificationBell'
import AppIcon from '../../components/AppIcon'
import { getRiskLevel, getRiskColor } from '../../lib/relapsePrediction'
import { HELPLINES } from '../../config/helplines'

// Crisis Contacts (single source: src/config/helplines.js)
const CRISIS_CONTACTS = HELPLINES.map((h) => ({
  name: h.name, phone: h.phone, hours: `${h.hours} free`, priority: h.priority,
}))

function triggerConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const isMobile = window.innerWidth < 768
  const count = isMobile ? 25 : 50
  const colors = ['#2DD4BF', '#2DD4BF', '#2DD4BF', '#FFFFFF', '#7DBDEE', '#7DBDEE']
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const piece = document.createElement('div')
      piece.style.cssText = `
        position: fixed; width: ${Math.random() * 8 + 6}px; height: ${Math.random() * 8 + 6}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}%; top: -20px; z-index: var(--z-toast); pointer-events: none;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation: confettiFall ${Math.random() * 2 + 2}s ease-out forwards;
      `
      document.body.appendChild(piece)
      setTimeout(() => piece.remove(), 3500)
    }, i * 20)
  }
}

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: #7DBDEE; color: #2DD4BF; padding: 10px 20px; border-radius: 100px;
    font-size: 13px; font-weight: 500; z-index: var(--z-toast);
    box-shadow: 0 4px 16px rgba(11,18,32,0.4); border: 1px solid rgba(255,255,255,0.4);
    animation: slideInRight 0.3s ease-out; white-space: nowrap;
  `
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in forwards'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

function UsernamePrompt({ userId, onComplete }) {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)

  const checkUsername = async (val) => {
    if (val.length < 3) { setStatus(''); return }
    setStatus('checking')
    try {
      const { data } = await supabase.from('profiles').select('username').eq('username', val.toLowerCase().trim()).maybeSingle()
      setStatus(data ? 'taken' : 'available')
    } catch (err) { setStatus('') }
  }

  const handleChange = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(cleaned)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (cleaned.length < 3) { setStatus(''); return }
    debounceRef.current = setTimeout(() => checkUsername(cleaned), 400)
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const handleSave = async () => {
    setError('')
    if (!username || username.length < 3) { setError('Username must be at least 3 characters.'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('Only letters, numbers, and underscores.'); return }
    if (status === 'taken') { setError('Username already taken.'); return }
    setLoading(true)
    const { error: updateError } = await supabase.from('profiles').update({ username: username.toLowerCase().trim() }).eq('id', userId)
    if (updateError) { setError('Could not save username. Try again.'); setLoading(false); return }
    setLoading(false)
    onComplete(username.toLowerCase().trim())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.97)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px' }}>
        <AppIcon name="users" size={40} style={{ display: 'block', margin: '0 auto 12px', color: '#7DBDEE' }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#FFFFFF', marginBottom: '8px', textAlign: 'center' }}>One last thing</h2>
        <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.6 }}>Choose a username for The Circle, Whispers, and your profile. This is how others will see you — anonymously.</p>
        {error && <div className="fs-13" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', marginBottom: '1rem' }}>{error}</div>}
        <div className="form-group">
          <label>USERNAME</label>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="e.g. amina_w" value={username} onChange={e => handleChange(e.target.value)} style={{ paddingRight: 40 }} onKeyDown={e => e.key === 'Enter' && handleSave()} />
            {status === 'checking' && <AppIcon name="clock" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#7DBDEE' }} />}
            {status === 'available' && <AppIcon name="check" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#2DD4BF' }} />}
            {status === 'taken' && <AppIcon name="close" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF' }} />}
          </div>
          {status === 'taken' && <span className="fs-12" style={{ color: '#FFFFFF' }}>Username already taken</span>}
          {status === 'available' && <span className="fs-12" style={{ color: '#2DD4BF' }}>Username available!</span>}
          <span className="fs-12" style={{ color: 'rgba(255,255,255,0.4)' }}>Letters, numbers, and underscores only</span>
        </div>
        <button className="btn-primary full" onClick={handleSave} disabled={loading || status === 'taken' || status === 'checking'}>{loading ? <span className="spinner" /> : 'Save & Continue →'}</button>
      </div>
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [cbtCount, setCbtCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [circleOnline, setCircleOnline] = useState(0)
  const [whispersActive, setWhispersActive] = useState(0)
  const [riskData, setRiskData] = useState(null)
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false)
  const [userId, setUserId] = useState(null)
  const [streakCelebrated, setStreakCelebrated] = useState(false)
  const [showCrisisModal, setShowCrisisModal] = useState(false)
  const touchStartY = useRef(0)
  const pullThreshold = 80
  const mountedRef = useRef(true)
  const fetchIdRef = useRef(0)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    fetchIdRef.current += 1
    const currentFetchId = fetchIdRef.current

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      if (mountedRef.current && currentFetchId === fetchIdRef.current) { setSessionExpired(true); setLoading(false) }
      return
    }
    const uid = session.user.id
    if (mountedRef.current) { setUserId(uid); setSessionExpired(false) }

    const [profileRes, entriesRes, cbtRes, circleRes, whispersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('diary_entries').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(7),
      supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('completed', true),
      supabase.from('circle_room_members').select('*', { count: 'exact', head: true }).gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
      supabase.from('whispers_matches').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    if (!mountedRef.current || currentFetchId !== fetchIdRef.current) return

    const profileData = profileRes.data
    const entriesData = entriesRes.data || []

    if (!profileData) {
      const { data: newProfile } = await supabase.from('profiles').upsert({ id: uid, full_name: session.user.user_metadata?.full_name || '', username: null, streak_days: 0, risk_level: 'low' }).select().single()
      if (mountedRef.current) { setProfile(newProfile); setShowUsernamePrompt(true); setLoading(false) }
      return
    }

    setProfile(profileData)
    if (!profileData.username) { setShowUsernamePrompt(true); setLoading(false); return }
    if (sessionStorage.getItem('losslens_new_signup') === uid && profileData.onboarding_completed !== true && profileData.onboarding_skipped !== true) {
      navigate('/onboarding', { replace: true })
      return
    }

    setEntries(entriesData); setCbtCount(cbtRes.count || 0); setCircleOnline(circleRes.count || 0); setWhispersActive(whispersRes.count || 0)

    try {
      const risk = await getRiskLevel(uid)
      if (mountedRef.current) setRiskData(risk)
    } catch (err) { console.error('Risk fetch error:', err) }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const today = new Date()
    const week = days.map((day, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (6 - i))
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const entry = entriesData.find(e => e.date === dateStr)
      return { day, gambled: entry ? entry.gambled : false, mood: entry ? entry.mood : null }
    })
    setWeekData(week); setLoading(false)
  }, [navigate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); const dismissed = sessionStorage.getItem('pwa_install_dismissed'); const isStandalone = window.matchMedia('(display-mode: standalone)').matches; if (!dismissed && !isStandalone) { setTimeout(() => setShowInstallPrompt(true), 3000) } }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const installPWA = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') setShowInstallPrompt(false); setDeferredPrompt(null); sessionStorage.setItem('pwa_install_dismissed', 'true') }

  useEffect(() => {
    if (profile?.streak_days > 0 && profile.streak_days % 7 === 0 && !streakCelebrated) {
      setStreakCelebrated(true)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) triggerConfetti()
      showToast(` ${profile.streak_days} days clean! You're amazing!`, 4000)
    }
  }, [profile?.streak_days, streakCelebrated])

  const handleTouchStart = (e) => { if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY }
  const handleTouchMove = (e) => { if (touchStartY.current === 0) return; const distance = e.touches[0].clientY - touchStartY.current; if (distance > 0 && window.scrollY === 0) { setPullDistance(Math.min(distance * 0.4, 120)) } }
  const handleTouchEnd = async () => { if (pullDistance >= pullThreshold && !refreshing) { setRefreshing(true); await fetchData(); showToast('Dashboard refreshed ', 2000); setRefreshing(false) } touchStartY.current = 0; setPullDistance(0) }

  const stats = [
    { label: 'Days clean', value: profile?.streak_days || 0, icon: 'flame', ariaLabel: 'Streak days', highlight: (profile?.streak_days || 0) >= 7 },
    { label: 'Money saved', value: profile?.money_saved ? `KES ${profile.money_saved.toLocaleString()}` : 'KES 0', icon: 'coin', ariaLabel: 'Money saved' },
    { label: 'Sessions logged', value: entries.length, icon: 'diary', ariaLabel: 'Sessions logged', emptyMessage: 'First entry coming soon!' },
    { label: 'CBT modules', value: cbtCount, icon: 'brain', ariaLabel: 'CBT modules completed', highlight: cbtCount >= 3 },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
        <div style={{ animation: 'logoBreathe 2s ease-in-out infinite' }}><span style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: '#2DD4BF', fontWeight: 700 }}>LossLens</span></div>
        <div style={{ display: 'flex', gap: '10px' }}>{[0, 1, 2].map(i => (<div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />))}</div>
      </div>
    )
  }

  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <AppIcon name="alert" size={56} style={{ display: 'block', margin: '0 auto 16px', color: '#2DD4BF' }} />
          <h2 className="fs-22" style={{ color: '#2DD4BF', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Please log in</h2>
          <p className="fs-14" style={{ color: '#2DD4BF', marginBottom: '24px' }}>Your session has expired.</p>
          <button onClick={() => navigate('/login', { replace: true })} className="fs-14" style={{ padding: '14px 32px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%' }}>Go to Login →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      {showUsernamePrompt && userId && (
        <UsernamePrompt userId={userId} onComplete={(newUsername) => { setProfile(prev => ({ ...prev, username: newUsername })); setShowUsernamePrompt(false); showToast(`Welcome to LossLens, @${newUsername}! `, 3000); }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div>
            <h1 className="fs-18" style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}>
              {new Date().getHours() < 12 ? '' : new Date().getHours() < 17 ? '' : ''} {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, <span style={{ color: '#2DD4BF' }}>{firstName}</span>
            </h1>
            <p className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{profile?.streak_days ? `${profile.streak_days}-day streak ` : 'Start your streak today'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBell />
            <span className={`risk-badge ${profile?.risk_level || 'low'}`}>{(profile?.risk_level || 'Low').charAt(0).toUpperCase() + (profile?.risk_level || 'low').slice(1)} Risk</span>
          </div>
        </div>

        {showInstallPrompt && (
          <div style={{ background: '#171E2B', border: '2px solid #2DD4BF', borderRadius: '16px', padding: '16px 20px', margin: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', animation: 'slideDown 0.4s ease-out', boxShadow: '0 4px 20px rgba(45,212,191,0.2)' }}>
            <AppIcon name="download" size={36} style={{ flexShrink: 0, color: '#2DD4BF' }} />
            <div style={{ flex: 1, minWidth: '200px' }}><p className="fs-14" style={{ color: '#2DD4BF', fontWeight: 600, margin: '0 0 4px' }}>Add LossLens to your home screen</p><p className="fs-12" style={{ color: '#FFFFFF', margin: 0, lineHeight: '1.5' }}>Install for quick access — works offline, no app store needed.</p></div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => { setShowInstallPrompt(false); sessionStorage.setItem('pwa_install_dismissed', 'true') }} className="fs-12" style={{ padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>Not now</button>
              <button onClick={installPWA} className="fs-12" style={{ padding: '8px 20px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>Install </button>
            </div>
          </div>
        )}

        <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ position: 'relative' }}>
          {pullDistance > 0 && (
            <div style={{ position: 'fixed', top: 0, left: '50%', zIndex: 'var(--z-modal)', transform: 'translateX(-50%)', paddingTop: Math.max(pullDistance - 40, 4), pointerEvents: 'none' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '2px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${Math.min(pullDistance * 3, 360)}deg)`, opacity: Math.min(pullDistance / pullThreshold, 1) }}>
                {refreshing ? <div style={{ width: '16px', height: '16px', border: '2px solid #2DD4BF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : <span className="fs-16" style={{ color: '#2DD4BF' }}>{pullDistance >= pullThreshold ? '' : '↓'}</span>}
              </div>
            </div>
          )}

          <div className="dashboard" style={{ padding: '1.5rem' }}>
            {riskData && (
              <div role="alert" aria-live="polite" style={{ background: getRiskColor(riskData.score).bg, border: `1px solid ${getRiskColor(riskData.score).color}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: riskData.factors?.length > 0 ? '8px' : '0' }}>
                  <h3 className="fs-14" style={{ color: getRiskColor(riskData.score).color, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>{riskData.level !== 'low' && <AppIcon name="alert" size={16} />}{getRiskColor(riskData.score).label} Today</h3>
                  <span className="fs-20" style={{ color: getRiskColor(riskData.score).color, fontWeight: 700 }}>{riskData.score}%</span>
                </div>
                {(riskData.factors || []).map((f, i) => (<p key={i} className="fs-12" style={{ color: getRiskColor(riskData.score).color, opacity: 0.8, margin: '2px 0' }}>• {f}</p>))}
                {riskData.level === 'high' && <button onClick={() => navigate('/urge-toolkit')} className="fs-13" style={{ width: '100%', marginTop: '10px', padding: '10px', background: '#2DD4BF', border: 'none', borderRadius: '8px', color: '#0B1220', fontWeight: 600, cursor: 'pointer' }}> Open Urge Toolkit</button>}
              </div>
            )}

            <div className="stats-grid">
              {stats.map((s, i) => (
                <div className="stat-card" key={i} style={s.highlight ? { borderColor: '#2DD4BF', boxShadow: '0 0 12px rgba(45,212,191,0.3)' } : {}}>
                  <span className="stat-icon" aria-label={s.ariaLabel}>{s.highlight ? <span className="streak-fire"><AppIcon name={s.icon} size={20} /></span> : <AppIcon name={s.icon} size={20} />}</span>
                  <span className="stat-value" style={s.highlight ? { color: '#2DD4BF' } : {}}>{s.value || '—'}</span>
                  <span className="stat-label">{s.value === 0 && s.emptyMessage ? s.emptyMessage : s.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
              <Link to="/circle" className="clickable" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, #7DBDEE 100%)', border: '1px solid #2DD4BF', borderRadius: '12px', padding: '1rem', display: 'block', textDecoration: 'none' }}>
                <AppIcon name="users" size={24} style={{ color: '#2DD4BF' }} /><h3 className="fs-13" style={{ color: '#2DD4BF', margin: '6px 0 4px' }}>The Circle</h3><p className="fs-12" style={{ color: '#2DD4BF', fontWeight: 300, margin: 0 }}>{circleOnline > 0 ? `${circleOnline} members online` : 'Join the conversation'}</p>
              </Link>
              <Link to="/whispers" className="clickable" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '1rem', display: 'block', textDecoration: 'none' }}>
                <AppIcon name="chat" size={24} style={{ color: '#7DBDEE' }} /><h3 className="fs-13" style={{ color: '#FFFFFF', margin: '6px 0 4px' }}>Whispers</h3><p className="fs-12" style={{ color: '#2DD4BF', fontWeight: 300, margin: 0 }}>{whispersActive > 0 ? `${whispersActive} active chats` : 'Find a peer'}</p>
              </Link>
            </div>

            <div className="dash-section">
              <div className="section-header"><h3>This week</h3></div>
              <div className="week-chart">{weekData.map((d, i) => (<div className="week-day" key={i}><div className={`day-bar ${d.gambled ? 'gambled' : 'clean'}`} style={{ height: d.gambled ? '40px' : d.mood ? '60px' : '30px', transition: 'height 0.3s ease' }} /><span className="day-label">{d.day}</span></div>))}</div>
              <div className="chart-legend"><span className="legend-item"><span className="dot clean"></span> Clean day</span><span className="legend-item"><span className="dot gambled"></span> Gambled</span></div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '0.75rem' }}>Explore LossLens</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {[{ icon: 'diary', label: 'Diary', path: '/diary' }, { icon: 'brain', label: 'CBT Modules', path: '/cbt' }, { icon: 'toolkit', label: 'Urge Toolkit', path: '/urge-toolkit' }, { icon: 'calendar', label: 'Events', path: '/events' }, { icon: 'resources', label: 'Resources', path: '/resources' }, { icon: 'users', label: 'Family Portal', path: '/family-portal' }, { icon: 'document', label: 'Monthly Mirror', path: '/monthly-mirror' }, { icon: 'heart', label: 'LossLens Pact', path: '/precious-pact' }].map(item => (
                  <button key={item.path} onClick={() => navigate(item.path)} className="fs-12" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px', color: '#7DBDEE', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                    <AppIcon name={item.icon} size={22} style={{ color: '#7DBDEE' }} /><span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <AIChat profile={profile} />

            <div className="dash-section">
              <div className="section-header"><h3>Recent diary entries</h3><button type="button" className="see-all clickable" onClick={() => navigate('/diary')}>See all</button></div>
              <div className="entries-list">
                {entries.length === 0 ? (
                  <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '1.5rem' }}>No entries yet. Log your first diary entry!</p>
                ) : entries.slice(0, 3).map((e) => (
                  <div className="entry-item" key={e.id || e.date}>
                    <div className="entry-top"><span className="entry-date">{new Date(e.date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className={`entry-status ${e.gambled ? 'gambled' : 'clean'}`}>{e.gambled ? 'Gambled' : 'Clean'}</span></div>
                    <div className="entry-mood">{e.mood || '—'}</div>
                    <p className="entry-note">{e.notes || 'No notes added.'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Crisis Support Bar - Updated with multiple contacts */}
            <div style={{ position: 'relative', background: 'rgba(255,255,255,0.12)', border: '2px solid #FFFFFF', borderRadius: '14px', padding: '16px', marginBottom: '1rem' }}>
              <button type="button" className="card-action" aria-label="Open crisis support options" onClick={() => setShowCrisisModal(true)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <AppIcon name="alert" size={24} style={{ color: '#FFFFFF', flexShrink: 0 }} />
                <div>
                  <p className="fs-13" style={{ color: '#FFFFFF', fontWeight: 600, margin: 0 }}>Feeling overwhelmed? You're not alone.</p>
                  <p className="fs-12" style={{ color: '#2DD4BF', margin: '2px 0 0' }}>Tap here for free 24/7 support options</p>
                </div>
                <span className="fs-18" style={{ color: '#FFFFFF', marginLeft: 'auto' }}>→</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Crisis Support Modal */}
      {showCrisisModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.95)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowCrisisModal(false)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '2px solid #FFFFFF', maxWidth: '450px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <AppIcon name="alert" size={48} style={{ display: 'block', margin: '0 auto 8px', color: '#FFFFFF' }} />
              <h2 style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0 0 8px' }}>You're Not Alone</h2>
              <p className="fs-13" style={{ color: '#2DD4BF', lineHeight: '1.6', margin: 0 }}>These services are free, confidential, and available to anyone in Kenya. Reach out anytime.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
              {CRISIS_CONTACTS.map((contact, i) => (
                <a key={i} href={`tel:${contact.phone.replace(/\s/g, '')}`} style={{
                  textDecoration: 'none', background: contact.priority ? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08))' : '#0B1220',
                  border: contact.priority ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '12px', padding: contact.priority ? '18px' : '14px',
                  display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = contact.priority ? '#FFFFFF' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'scale(1)' }}>
                  {contact.priority && <AppIcon name="star" size={20} style={{ flexShrink: 0, color: '#F2C879' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: contact.priority ? '#FFFFFF' : '#FFFFFF', fontSize: contact.priority ? '15px' : '13px', fontWeight: 600 }}>{contact.name}</span>
                      {contact.priority && <span className="fs-12" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>First Call</span>}
                    </div>
                    <p className="fs-12" style={{ color: '#2DD4BF', margin: '2px 0 0' }}>{contact.phone}  · {contact.hours}</p>
                  </div>
                  <span className="fs-18" style={{ color: contact.priority ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}>→</span>
                </a>
              ))}
            </div>
            <p className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '1rem' }}>All calls are free, confidential, and available 24/7.</p>
            <button onClick={() => setShowCrisisModal(false)} className="btn-primary full fs-14" style={{ padding: '12px' }}>Close</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes confettiFall { 0%{transform:translateY(-100%) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes logoBreathe { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.05);opacity:0.7} }
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-12px);opacity:1} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default Dashboard
