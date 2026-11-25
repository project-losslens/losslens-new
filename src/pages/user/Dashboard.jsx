import { recoveryDate } from '../../lib/calendar'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import SupportChoices from '../../components/SupportChoices'
import { useI18n } from '../../i18n'
import { usePgsi } from '../../context/PgsiContext'
import { pgsiPercentage } from '../../lib/pgsi'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, subscribeToNotifications } from '../../lib/notifications'

function triggerConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const isMobile = window.innerWidth < 768
  const count = isMobile ? 25 : 50
  const colors = ['var(--primary)', 'var(--primary)', 'var(--primary)', 'var(--text-muted)', 'var(--secondary)', 'var(--secondary)']
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


function UsernamePrompt({ userId, onComplete }) {
  const { t } = useI18n()
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
    } catch  { setStatus('') }
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
    if (!username || username.length < 3) { setError(t('dashboard.usernameMin')); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError(t('dashboard.usernameChars')); return }
    if (status === 'taken') { setError(t('dashboard.usernameTakenErr')); return }
    setLoading(true)
    const { error: updateError } = await supabase.from('profiles').update({ username: username.toLowerCase().trim() }).eq('id', userId)
    if (updateError) { setError(t('dashboard.usernameSaveErr')); setLoading(false); return }
    setLoading(false)
    onComplete(username.toLowerCase().trim())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--bg-rgb) / 0.97)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px' }}>
        <AppIcon name="users" size={40} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--secondary)' }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#FFFFFF', marginBottom: '8px', textAlign: 'center' }}>{t('dashboard.usernameTitle')}</h2>
        <p className="fs-13" style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.6 }}>{t('dashboard.usernameSub')}</p>
        {error && <div className="fs-13" style={{ background: 'rgb(var(--danger-rgb) / 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        <div className="form-group">
          <label>{t('dashboard.usernameLabel')}</label>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="e.g. amina_w" value={username} onChange={e => handleChange(e.target.value)} style={{ paddingRight: 40 }} onKeyDown={e => e.key === 'Enter' && handleSave()} />
            {status === 'checking' && <AppIcon name="clock" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)' }} />}
            {status === 'available' && <AppIcon name="check" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />}
            {status === 'taken' && <AppIcon name="close" size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF' }} />}
          </div>
          {status === 'taken' && <span className="fs-12" style={{ color: '#FFFFFF' }}>{t('dashboard.usernameTaken')}</span>}
          {status === 'available' && <span className="fs-12" style={{ color: 'var(--primary)' }}>{t('dashboard.usernameAvailable')}</span>}
          <span className="fs-12" style={{ color: 'var(--text-muted)' }}>{t('dashboard.usernameRules')}</span>
        </div>
        <button className="btn-primary full" onClick={handleSave} disabled={loading || status === 'taken' || status === 'checking'}>{loading ? <BrandLoader variant="inline" showWordmark={false} /> : `${t('dashboard.usernameSave')} →`}</button>
      </div>
    </div>
  )
}

function Dashboard() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
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

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    fetchIdRef.current += 1
    const currentFetchId = fetchIdRef.current
    try {

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (mountedRef.current && currentFetchId === fetchIdRef.current) setLoadError('')
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

      const failure = profileRes.error || entriesRes.error || cbtRes.error || circleRes.error || whispersRes.error
      if (failure || !profileData) throw failure || new Error('Your profile could not be loaded')

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

      const today = new Date(recoveryDate() + 'T12:00:00+03:00')
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setUTCDate(today.getUTCDate() - (6 - i))
        const dateStr = recoveryDate(d)
        const day = d.toLocaleDateString('en-KE', { weekday: 'short', timeZone: 'Africa/Nairobi' })
        const entry = entriesData.find(e => e.date === dateStr)
        return { day, gambled: entry ? entry.gambled : false, mood: entry ? entry.mood : null }
      })
      if (!mountedRef.current || currentFetchId !== fetchIdRef.current) return false
      setWeekData(week); setLoading(false)
      return true
    } catch (error) {
      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setLoadError(error.message || 'Dashboard could not be loaded. Please retry.')
        setLoading(false)
      }
      return false
    }
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
      toast.success(`${profile.streak_days} days clean! You're amazing!`, 4000)
    }
  }, [profile?.streak_days, streakCelebrated])

  const handleTouchStart = (e) => { if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY }
  const handleTouchMove = (e) => { if (touchStartY.current === 0) return; const distance = e.touches[0].clientY - touchStartY.current; if (distance > 0 && window.scrollY === 0) { setPullDistance(Math.min(distance * 0.4, 120)) } }
  const handleTouchEnd = async () => { if (pullDistance >= pullThreshold && !refreshing) { setRefreshing(true); const refreshed = await fetchData(); if (refreshed) toast.success(t('dashboard.refreshToast'), 2000); setRefreshing(false) } touchStartY.current = 0; setPullDistance(0) }

  const [moneyInfoOpen, setMoneyInfoOpen] = useState(false)
  const stats = [
    { label: t('dashboard.stat.daysClean'), value: profile?.streak_days || 0, icon: 'flame', ariaLabel: t('dashboard.stat.streakAria'), highlight: (profile?.streak_days || 0) >= 7 },
    { label: t('dashboard.stat.moneySaved'), value: profile?.money_saved ? `KES ${profile.money_saved.toLocaleString()}` : 'KES 0', icon: 'coin', ariaLabel: t('dashboard.stat.moneyAria'), onClick: () => setMoneyInfoOpen(o => !o) },
    { label: t('dashboard.stat.sessions'), value: entries.length, icon: 'diary', ariaLabel: t('dashboard.stat.sessionsAria'), emptyMessage: t('dashboard.stat.firstEntry') },
    { label: t('dashboard.stat.cbt'), value: cbtCount, icon: 'brain', ariaLabel: t('dashboard.stat.cbtAria'), highlight: cbtCount >= 3 },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || t('dashboard.there')

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
        <BrandLoader variant="section" />
      </div>
    )
  }

  if (loadError) {
    return <section role="alert" className="card"><h2>Dashboard could not be loaded</h2><p>{loadError}</p><button type="button" className="btn-primary" onClick={() => { setLoading(true); void fetchData() }}>Retry</button></section>
  }

  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <AppIcon name="alert" size={56} style={{ display: 'block', margin: '0 auto 16px', color: 'var(--primary)' }} />
          <h2 className="fs-22" style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>{t('dashboard.sessionExpired')}</h2>
          <p className="fs-14" style={{ color: 'var(--primary)', marginBottom: '24px' }}>{t('dashboard.sessionExpiredSub')}</p>
          <button onClick={() => navigate('/login', { replace: true })} className="fs-14" style={{ padding: '14px 32px', borderRadius: '100px', background: 'var(--primary)', border: 'none', color: 'var(--on-primary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%' }}>{t('dashboard.goToLogin')} →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      {showUsernamePrompt && userId && (
        <UsernamePrompt userId={userId} onComplete={(newUsername) => { setProfile(prev => ({ ...prev, username: newUsername })); setShowUsernamePrompt(false); toast.success(t('dashboard.welcomeUsername', { username: newUsername }), 3000); }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar dashboard-summary plum-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div>
            <h2 className="fs-18" style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}>
              {new Date().getHours() < 12 ? t('dashboard.greeting.morning') : new Date().getHours() < 17 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.evening')}, <span style={{ color: 'var(--primary)' }}>{firstName}</span>
            </h2>
            <p className="fs-12" style={{ color: 'var(--text-muted)', margin: '2px 0 0' }}>{profile?.streak_days ? t('dashboard.streakDays', { count: profile.streak_days }) : t('dashboard.startStreak')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBell />
            <span className={`risk-badge ${profile?.risk_level || 'low'}`}>{t('dashboard.riskBadge', { level: (profile?.risk_level || 'low').charAt(0).toUpperCase() + (profile?.risk_level || 'low').slice(1) })}</span>
          </div>
        </div>

        {showInstallPrompt && (
          <div style={{ background: 'var(--surface-2)', border: '2px solid var(--primary)', borderRadius: '16px', padding: '16px 20px', margin: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', animation: 'slideDown 0.4s ease-out', boxShadow: '0 4px 20px rgb(var(--primary-rgb) / 0.2)' }}>
            <AppIcon name="download" size={36} style={{ flexShrink: 0, color: 'var(--primary)' }} />
            <div style={{ flex: 1, minWidth: '200px' }}><p className="fs-14" style={{ color: 'var(--primary)', fontWeight: 600, margin: '0 0 4px' }}>{t('dashboard.installTitle')}</p><p className="fs-12" style={{ color: '#FFFFFF', margin: 0, lineHeight: '1.5' }}>{t('dashboard.installSub')}</p></div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => { setShowInstallPrompt(false); sessionStorage.setItem('pwa_install_dismissed', 'true') }} className="fs-12" style={{ padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>{t('dashboard.installNotNow')}</button>
              <button onClick={installPWA} className="fs-12" style={{ padding: '8px 20px', borderRadius: '100px', background: 'var(--primary)', border: 'none', color: 'var(--on-primary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>{t('dashboard.install')} </button>
            </div>
          </div>
        )}

        <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ position: 'relative' }}>
          {pullDistance > 0 && (
            <div style={{ position: 'fixed', top: 0, left: '50%', zIndex: 'var(--z-modal)', transform: 'translateX(-50%)', paddingTop: Math.max(pullDistance - 40, 4), pointerEvents: 'none' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${Math.min(pullDistance * 3, 360)}deg)`, opacity: Math.min(pullDistance / pullThreshold, 1) }}>
                {refreshing ? <BrandLoader variant="inline" showWordmark={false} /> : <span className="fs-16" style={{ color: 'var(--primary)' }}>{pullDistance >= pullThreshold ? '' : '↓'}</span>}
              </div>
            </div>
          )}

          <div className="dashboard" style={{ padding: '1.5rem' }}>
            <PgsiDashboardCard />
            <div className="stats-grid">
              {stats.map((s, i) => {
                const inner = (<>
                  <span className="stat-icon" aria-label={s.ariaLabel}>{s.highlight ? <span className="streak-fire"><AppIcon name={s.icon} size={20} /></span> : <AppIcon name={s.icon} size={20} />}</span>
                  <span className="stat-value" style={s.highlight ? { color: 'var(--primary)' } : {}}>{s.value || '—'}</span>
                  <span className="stat-label">{s.value === 0 && s.emptyMessage ? s.emptyMessage : s.label}</span>
                </>)
                const cardStyle = s.highlight ? { borderColor: 'var(--primary)', boxShadow: '0 0 12px rgb(var(--primary-rgb) / 0.3)' } : {}
                return s.onClick ? (
                  <button type="button" key={i} className="stat-card clickable" onClick={s.onClick} aria-expanded={moneyInfoOpen} aria-label={`${s.ariaLabel} — show calculation`} style={{ ...cardStyle, width: '100%', font: 'inherit', color: 'inherit', textAlign: 'inherit' }}>{inner}</button>
                ) : (
                  <div className="stat-card" key={i} style={cardStyle}>{inner}</div>
                )
              })}
            </div>

            {moneyInfoOpen && (
              <p className="fs-12" style={{ color: 'var(--text-muted)', margin: '-0.5rem 0 1rem', lineHeight: 1.6 }}>
                {t('dashboard.moneyFormula')}
              </p>
            )}

            <Link to="/diary" className="clickable" style={{ display: 'block', background: 'var(--surface)', border: '1px solid var(--primary)', borderRadius: '14px', padding: '16px', marginBottom: '1rem', textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AppIcon name="diary" size={28} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <h3 className="fs-15" style={{ color: '#FFFFFF', margin: 0 }}>{t('dashboard.checkinTitle')}</h3>
                  <p className="fs-12" style={{ color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('dashboard.checkinSub')}</p>
                </div>
                <span className="fs-13" style={{ color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('dashboard.checkinStart')}</span>
              </div>
            </Link>

            {riskData && (
              <div role="alert" aria-live="polite" style={{ background: getRiskColor(riskData.score).bg, border: `1px solid ${getRiskColor(riskData.score).color}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: riskData.factors?.length > 0 ? '8px' : '0' }}>
                  <h3 className="fs-14" style={{ color: getRiskColor(riskData.score).color, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>{riskData.level !== 'low' && <AppIcon name="alert" size={16} />}{getRiskColor(riskData.score).label} {t('dashboard.riskToday')}</h3>
                </div>
                {(riskData.factors || []).map((f, i) => {
                  const explained = explainRiskFactor(f)
                  const text = explained
                    ? t(explained.key, explained.params.day ? { ...explained.params, day: t(explained.params.day) } : explained.params)
                    : f
                  return <p key={i} className="fs-12" style={{ color: getRiskColor(riskData.score).color, opacity: 0.8, margin: '2px 0' }}>• {text}</p>
                })}
                <p className="fs-12" style={{ color: getRiskColor(riskData.score).color, opacity: 0.7, margin: '6px 0 0' }}>{t('dashboard.riskSuggested')}</p>
                {riskData.level !== 'low' && <button onClick={() => navigate('/urge-toolkit')} className="fs-13" style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: '8px', color: 'var(--on-primary)', fontWeight: 600, cursor: 'pointer' }}> {t('dashboard.openToolkit')}</button>}
              </div>
            )}

            <Link to="/cbt" className="clickable" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', marginBottom: '1rem', textDecoration: 'none' }}>
              <AppIcon name="brain" size={28} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h3 className="fs-15" style={{ color: '#FFFFFF', margin: 0 }}>{t('dashboard.continue')}</h3>
                <p className="fs-12" style={{ color: 'var(--text-muted)', margin: '2px 0 0' }}>{cbtCount > 0 ? t(cbtCount === 1 ? 'dashboard.continueModule' : 'dashboard.continueModules', { count: cbtCount }) : t('dashboard.continueFirst')}</p>
              </div>
              <span className="fs-13" style={{ color: 'var(--secondary)', fontWeight: 600 }}>{t('dashboard.continueOpen')}</span>
            </Link>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
              <Link to="/circle" className="clickable" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgb(var(--secondary-rgb) / 0.12))', border: '1px solid var(--primary)', borderRadius: '12px', padding: '1rem', display: 'block', textDecoration: 'none' }}>
                <AppIcon name="users" size={24} style={{ color: 'var(--primary)' }} /><h3 className="fs-13" style={{ color: 'var(--primary)', margin: '6px 0 4px' }}>The Circle</h3><p className="fs-12" style={{ color: 'var(--primary)', fontWeight: 300, margin: 0 }}>{circleOnline > 0 ? t('dashboard.circleOnline', { count: circleOnline }) : t('dashboard.circleJoin')}</p>
              </Link>
              <Link to="/whispers" className="clickable" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '1rem', display: 'block', textDecoration: 'none' }}>
                <AppIcon name="chat" size={24} style={{ color: 'var(--secondary)' }} /><h3 className="fs-13" style={{ color: '#FFFFFF', margin: '6px 0 4px' }}>Whispers</h3><p className="fs-12" style={{ color: 'var(--primary)', fontWeight: 300, margin: 0 }}>{whispersActive > 0 ? t('dashboard.whispersActive', { count: whispersActive }) : t('dashboard.whispersFind')}</p>
              </Link>
            </div>

            <div className="dash-section">
              <div className="section-header"><h3>{t('dashboard.thisWeek')}</h3></div>
              <div className="week-chart">{weekData.map((d, i) => (<div className="week-day" key={i}><div className={`day-bar ${d.gambled ? 'gambled' : 'clean'}`} style={{ height: d.gambled ? '40px' : d.mood ? '60px' : '30px', transition: 'height 0.3s ease' }} /><span className="day-label">{d.day}</span></div>))}</div>
              <div className="chart-legend"><span className="legend-item"><span className="dot clean"></span> {t('dashboard.legendClean')}</span><span className="legend-item"><span className="dot gambled"></span> {t('dashboard.legendGambled')}</span></div>
            </div>


            <div className="dash-section">
              <div className="section-header"><h3>{t('dashboard.recentEntries')}</h3><button type="button" className="see-all clickable" onClick={() => navigate('/diary')}>{t('dashboard.seeAll')}</button></div>
              <div className="entries-list">
                {entries.length === 0 ? (
                  <p className="fs-13" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>{t('dashboard.noEntries')}</p>
                ) : entries.slice(0, 3).map((e) => (
                  <div className="entry-item" key={e.id || e.date}>
                    <div className="entry-top"><span className="entry-date">{new Date(e.date).toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className={`entry-status ${e.gambled ? 'gambled' : 'clean'}`}>{e.gambled ? t('dashboard.entryGambled') : t('dashboard.entryClean')}</span></div>
                    <div className="entry-mood">{e.mood || '—'}</div>
                    <p className="entry-note">{e.notes || t('dashboard.entryNoNotes')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Crisis Support Bar - Updated with multiple contacts */}
            <div style={{ position: 'relative', background: 'rgb(var(--danger-rgb) / 0.14)', border: '2px solid var(--danger)', borderRadius: '14px', padding: '16px', marginBottom: '1rem' }}>
              <button type="button" className="card-action" aria-label={t('dashboard.crisisAria')} onClick={() => setShowCrisisModal(true)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <AppIcon name="alert" size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <div>
                  <p className="fs-13" style={{ color: '#FFFFFF', fontWeight: 600, margin: 0 }}>{t('dashboard.crisisBarTitle')}</p>
                  <p className="fs-12" style={{ color: 'var(--danger)', margin: '2px 0 0' }}>{t('dashboard.crisisBarSub')}</p>
                </div>
                <span className="fs-18" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>→</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Crisis Support Modal */}
      {showCrisisModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--bg-rgb) / 0.95)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowCrisisModal(false)} />
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '2rem', border: '2px solid var(--danger)', maxWidth: '450px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <AppIcon name="alert" size={48} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--danger)' }} />
              <h2 style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0 0 8px' }}>{t('dashboard.crisisTitle')}</h2>
              <p className="fs-13" style={{ color: 'var(--danger)', lineHeight: '1.6', margin: 0 }}>{t('dashboard.crisisSub')}</p>
            </div>
            <SupportChoices />
            <p className="fs-12" style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1rem' }}>{t('dashboard.crisisFootnote')}</p>
            <button onClick={() => setShowCrisisModal(false)} className="btn-primary full fs-14" style={{ padding: '12px' }}>{t('dashboard.crisisClose')}</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes confettiFall { 0%{transform:translateY(-100%) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default Dashboard

function PgsiDashboardCard() {
  const pgsi = usePgsi()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changePersonalization = async event => {
    const enabled = event.target.checked
    setSaving(true); setError('')
    try { await pgsi.setPersonalization(enabled) } catch { setError('Your personalization choice was not saved. Please retry.') }
    finally { setSaving(false) }
  }
  return <section className="dash-section pgsi-dashboard" aria-label="PGSI self-check">
    <h2>PGSI score &middot; % of maximum</h2>
    {pgsi.error ? <p role="alert">{pgsi.error} <button type="button" className="btn-ghost" onClick={pgsi.refresh}>Retry self-check status</button></p> : !pgsi.loaded ? <p role="status">Loading your private self-check...</p> : pgsi.latest ? <>
      <p className="pgsi-percentage">{pgsiPercentage(pgsi.latest.raw_score)}%</p>
      <p>{pgsi.latest.raw_score}/27 points &middot; {new Date(pgsi.latest.completed_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' })}</p>
      <button type="button" className="btn-ghost" onClick={pgsi.knowMore}>Know more</button>
      <button type="button" className="btn-ghost" onClick={pgsi.startAssessment}>{pgsi.due ? 'Take your due self-check' : 'Take another self-check'}</button>
    </> : <button type="button" className="btn-primary" onClick={pgsi.startAssessment}>Take your first self-check</button>}
    <div className="pgsi-actions"><button type="button" className="btn-ghost" onClick={pgsi.showResources}>Find support at any score</button></div>
    {pgsi.loaded && <label className="pgsi-personalization"><input type="checkbox" checked={pgsi.personalization_enabled} disabled={saving} onChange={changePersonalization} />Let Oloo use my latest PGSI band and completion date</label>}
    <p className="pgsi-muted">Optional: this lets Oloo's AI provider use only your latest band and assessment date when you chat. Your answers are not shared. Turning it off applies to subsequent messages.</p>
    {error && <p role="alert" className="portal-error">{error}</p>}
  </section>
}

let riskWarningShown = false

function warnRiskColumns(error) {
  if (!riskWarningShown) {
    console.warn('Risk profile columns are unavailable; using the safe low-risk fallback.', error?.message || error)
    riskWarningShown = true
  }
}

// Calculate risk score based on diary patterns
async function calculateRiskScore(userId) {
  if (!userId) return { score: 0, factors: [] }

  const today = new Date()
  const todayStr = recoveryDate(today)
  const dayOfWeek = today.getDay()
  const hourOfDay = today.getHours()

  // Get recent diary entries (last 30 days)
  const { data: entries, error: entriesError } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', recoveryDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)))
    .order('date', { ascending: false })

  if (entriesError) {
    warnRiskColumns(entriesError)
    return { score: 0, level: 'low', factors: [] }
  }

  if (!entries || entries.length < 3) {
    return { score: 10, factors: ['Not enough data yet. Keep logging!'] }
  }

  let score = 0
  const factors = []

  // Factor 1: Day of week pattern
  const sameDayEntries = entries.filter(e => new Date(e.date).getDay() === dayOfWeek)
  const sameDayGambleRate = sameDayEntries.length > 0
    ? sameDayEntries.filter(e => e.gambled).length / sameDayEntries.length
    : 0
  if (sameDayGambleRate > 0.5) {
    score += 25
    factors.push(`${dayOfWeek === 5 || dayOfWeek === 6 ? 'Weekend' : 'This day'} has been high-risk historically`)
  }

  // Factor 2: Recent gambling pattern (last 7 days)
  const last7Days = entries.slice(0, 7)
  const recentGambleRate = last7Days.filter(e => e.gambled).length / last7Days.length
  if (recentGambleRate > 0.3) {
    score += 20
    factors.push('Recent gambling activity detected')
  }

  // Factor 3: Missed diary entries
  const daysSinceLastEntry = entries.length > 0
    ? Math.floor((today - new Date(entries[0].date)) / (1000 * 60 * 60 * 24))
    : 7
  if (daysSinceLastEntry > 2) {
    score += 15
    factors.push(`${daysSinceLastEntry} days since last diary entry`)
  }

  // Factor 4: Stress/mood pattern
  const recentMoods = entries.slice(0, 7).map(e => e.mood)
  const negativeMoods = recentMoods.filter(m =>
    m && (m.includes('Stressed') || m.includes('Anxious') || m.includes('Depressed'))
  ).length
  if (negativeMoods >= 3) {
    score += 20
    factors.push('Elevated stress levels in recent entries')
  }

  // Factor 5: Payday detection
  const dayOfMonth = today.getDate()
  if (dayOfMonth >= 28 || dayOfMonth <= 3) {
    score += 10
    factors.push('Payday period - financial triggers may be higher')
  }

  // Factor 6: Weekend
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    score += 5
    factors.push('Weekend - historically higher gambling risk')
  }

  // Factor 7: Evening hours
  if (hourOfDay >= 18 || hourOfDay <= 2) {
    score += 5
    factors.push('Evening hours - common trigger time')
  }

  score = Math.min(score, 100)

  // Save to profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      daily_risk_score: score,
      risk_factors: factors,
      last_risk_check: todayStr,
    })
    .eq('id', userId)

  if (updateError) {
    warnRiskColumns(updateError)
    return { score: 0, level: 'low', factors: [] }
  }

  return { score, factors }
}


async function getRiskLevel(userId) {
  if (!userId) return { score: 0, level: 'low', factors: [] }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('daily_risk_score, risk_factors, last_risk_check')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    if (profileError) warnRiskColumns(profileError)
    return { score: 0, level: 'low', factors: [] }
  }

  const today = recoveryDate()

  if (profile.last_risk_check !== today) {
    return await calculateRiskScore(userId)
  }

  const score = profile.daily_risk_score || 0
  let level = 'low'
  if (score >= 60) level = 'high'
  else if (score >= 30) level = 'medium'

  return {
    score,
    level,
    factors: profile.risk_factors || [],
  }
}

// Get risk color: high = danger, medium = warning, low = primary (never green for risk)
function getRiskColor(score) {
  if (score >= 60) return { bg: 'rgb(var(--danger-rgb) / 0.16)', color: 'var(--danger)', label: 'High Risk' }
  if (score >= 30) return { bg: 'rgb(var(--warning-rgb) / 0.16)', color: 'var(--warning)', label: 'Medium Risk' }
  return { bg: 'rgb(var(--primary-rgb) / 0.15)', color: 'var(--primary)', label: 'Low Risk' }
}

// Translate diary-risk factors separately from the PGSI assessment.

const RULES = [
  { match: /^Not enough data yet/, key: 'dashboard.riskFactor.noData' },
  { match: /has been high-risk historically$/, key: 'dashboard.riskFactor.dayHigh', dayParam: true },
  { match: /^Recent gambling activity detected$/, key: 'dashboard.riskFactor.recentGambling' },
  { match: /^(\d+) days since last diary entry$/, key: 'dashboard.riskFactor.missedEntries', countParam: true },
  { match: /^Elevated stress levels/, key: 'dashboard.riskFactor.stress' },
  { match: /^Payday period/, key: 'dashboard.riskFactor.payday' },
  { match: /^Weekend - historically/, key: 'dashboard.riskFactor.weekend' },
  { match: /^Evening hours/, key: 'dashboard.riskFactor.evening' },
]

// Returns { key, params } for t(), or null when no translation exists.
function explainRiskFactor(factor) {
  if (typeof factor !== 'string') return null
  for (const rule of RULES) {
    if (!rule.match.test(factor)) continue
    if (rule.countParam) {
      const count = factor.match(/^(\d+)/)?.[1]
      return { key: rule.key, params: { count } }
    }
    if (rule.dayParam) {
      const day = factor.replace(/ has been high-risk historically$/, '')
      // Diary-risk scoring emits 'Weekend' or 'This day' as the prefix.
      const dayKey = day === 'Weekend' ? 'dashboard.riskFactor.weekendDay' : 'dashboard.riskFactor.thisDay'
      return { key: rule.key, params: { day: dayKey } }
    }
    return { key: rule.key, params: {} }
  }
  return null
}

function NotificationBell() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchUserId()
  }, [])

  useEffect(() => {
    if (userId) {
      fetchNotifications()
      fetchUnreadCount()
      const unsubscribe = subscribeToNotifications(userId, (newNotif) => {
        setNotifications(prev => [newNotif, ...prev].slice(0, 20))
        setUnreadCount(prev => prev + 1)
      })
      return () => unsubscribe()
    }
  }, [userId])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setUserId(session.user.id)
  }

  const fetchNotifications = async () => {
    const data = await getNotifications(userId)
    setNotifications(data)
  }

  const fetchUnreadCount = async () => {
    const count = await getUnreadCount(userId)
    setUnreadCount(count)
  }

  const handleMarkAsRead = async (id, link) => {
    await markAsRead(id)
    setUnreadCount(prev => Math.max(0, prev - 1))
    if (link) navigate(link)
    setOpen(false)
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId)
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const getTypeStyle = (type) => {
    switch (type) {
      case 'danger': return { bg: 'rgb(var(--danger-rgb) / 0.16)', color: 'var(--danger)' }
      case 'warning': return { bg: 'rgb(var(--warning-rgb) / 0.16)', color: 'var(--warning)' }
      case 'success': return { bg: 'rgba(255,255,255,0.12)', color: 'var(--primary)' }
      case 'badge': return { bg: 'rgba(255,255,255,0.12)', color: 'var(--primary)' }
      default: return { bg: 'rgba(255,255,255,0.06)', color: 'var(--secondary)' }
    }
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Icon */}
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications() }}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          position: 'relative', fontSize: '20px', padding: '4px 8px',
          color: unreadCount > 0 ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
          transition: 'color 0.2s',
        }}
      >
        <AppIcon name="bell" size={20} />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            style={{
              position: 'absolute', top: '0', right: '0',
              background: 'var(--primary)', color: 'var(--on-primary)',
              fontSize: '10px', fontWeight: 700,
              width: '18px', height: '18px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="Notifications menu"
          style={{
            position: 'absolute', top: '40px', right: '-10px',
            width: '340px', maxHeight: '420px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
            boxShadow: '0 8px 32px rgb(var(--bg-rgb) / 0.5)', zIndex: 'var(--z-modal)',
            overflowY: 'auto', animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
            position: 'sticky', top: 0, background: 'rgba(255,255,255,0.06)', zIndex: 'var(--z-base)',
          }}>
            <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: 0 }}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--primary)',
                  fontSize: '11px', cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <AppIcon name="bell" size={32} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No notifications yet</p>
            </div>
          ) : (
            notifications.map(n => {
              const style = getTypeStyle(n.type)
              return (
                <div
                  key={n.id}
                  role="menuitem"
                  onClick={() => handleMarkAsRead(n.id, n.link)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: n.read ? 'transparent' : 'var(--bg)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'var(--bg)'}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: '18px', width: '32px', height: '32px',
                        borderRadius: '50%', background: style.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {n.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: '0 0 2px' }}>
                        {n.title.startsWith('notifications.') ? t(n.title) : n.title}
                        {!n.read && (
                          <span
                            aria-label="Unread"
                            style={{
                              width: '6px', height: '6px', borderRadius: '50%',
                              background: 'var(--primary)', display: 'inline-block', marginLeft: '6px',
                            }}
                          />
                        )}
                      </p>
                      <p style={{ color: 'var(--secondary)', fontSize: '12px', margin: '0 0 4px', lineHeight: '1.4' }}>
                        {n.message.startsWith('notifications.') ? t(n.message) : n.message}
                      </p>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
