import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'

//  Constants
const TABS = { PROFILE: 'profile', SETTINGS: 'settings', SECURITY: 'security', DATA: 'data' }
const AVATAR_OPTIONS = ['', '', '', '', '', '', '', '', '', '']
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function Profile() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [goal, setGoal] = useState('Abstinence')
  const [riskLevel, setRiskLevel] = useState('low')
  const [streakDays, setStreakDays] = useState(0)
  const [moneySaved, setMoneySaved] = useState(0)
  const [cleanSince, setCleanSince] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [joinedDate, setJoinedDate] = useState(null)
  const [totalSessions, setTotalSessions] = useState(0)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Report
  const [generatingReport, setGeneratingReport] = useState(false)

  // Stats
  const [stats, setStats] = useState({ totalEntries: 0, cleanDays: 0, gambleDays: 0, cbtCompleted: 0, cbtTotal: 8, eventsAttended: 0, topTriggers: [], topCoping: [], recentEntries: [], badges: [] })

  // Preferences
  const [prefs, setPrefs] = useState({ allow_analytics: false, share_research_data: false, mpesa_monitoring: false, low_data_mode: false, language: 'English' })
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Password change
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [mfaEnrollment, setMfaEnrollment] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const [activeTab, setActiveTab] = useState(TABS.PROFILE)
  const fileInputRef = useRef(null)

  useEffect(() => { fetchAllData() }, [])

  const fetchAllData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSessionExpired(true); setLoadingProfile(false); return }
    const uid = session.user.id
    setUserId(uid)
    setEmail(session.user.email)

    try {
      //  Parallelize independent queries
      const [profileRes, entriesRes, cbtDoneRes, cbtTotalRes, eventRes, badgesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('diary_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
        supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('completed', true),
        supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('badges').select('*'),
      ])

      const profile = profileRes.data
      if (profile) {
        setFullName(profile.full_name || '')
        setPhone(profile.phone?.replace('+254', '') || '')
        setGoal(profile.goal || 'Abstinence')
        setRiskLevel(profile.risk_level || 'low')
        setStreakDays(profile.streak_days || 0)
        setMoneySaved(profile.money_saved || 0)
        setCleanSince(profile.clean_since || null)
        const storedAvatar = profile.avatar_url || ''
        if (storedAvatar.startsWith('http')) {
          try {
            const parsedUrl = new URL(storedAvatar)
            const marker = '/storage/v1/object/public/avatars/'
            const markerIndex = parsedUrl.pathname.indexOf(marker)
            if (markerIndex >= 0) {
              const path = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length))
              const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from('avatars').createSignedUrl(path, 3600)
              if (signedUrlError) throw signedUrlError
              setAvatarUrl(signedUrlData.signedUrl)
            } else {
              setAvatarUrl('')
            }
          } catch (avatarError) {
            console.error('Profile avatar could not be loaded:', avatarError)
            setAvatarUrl('')
          }
        } else if (storedAvatar) {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('avatars').createSignedUrl(storedAvatar, 3600)
          if (signedUrlError) {
            console.error('Profile avatar could not be loaded:', signedUrlError)
            setAvatarUrl('')
          } else setAvatarUrl(signedUrlData.signedUrl)
        } else setAvatarUrl('')
        setJoinedDate(profile.created_at || null)
        if (profile.preferences) setPrefs(prev => ({ ...prev, ...profile.preferences }))
      }

      const allEntries = entriesRes.data || []
      const cleanDays = allEntries.filter(e => !e.gambled).length
      const uniqueDays = new Set(allEntries.map(e => e.date))
      setTotalSessions(uniqueDays.size)

      const triggerCount = {}; const copingCount = {}
      allEntries.forEach(e => { (e.triggers || []).forEach(t => { triggerCount[t] = (triggerCount[t] || 0) + 1 }); (e.coping || []).forEach(c => { copingCount[c] = (copingCount[c] || 0) + 1 }) })

      const actualCbtTotal = Math.max(cbtTotalRes.count || 8, 8)
      const allBadges = (badgesRes.data || []).map(b => ({ ...b, earned: (profile?.badges || []).includes(b.id) }))

      setStats({
        totalEntries: allEntries.length, cleanDays,
        gambleDays: allEntries.filter(e => e.gambled).length,
        cbtCompleted: cbtDoneRes.count || 0, cbtTotal: actualCbtTotal,
        eventsAttended: eventRes.count || 0,
        topTriggers: Object.entries(triggerCount).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topCoping: Object.entries(copingCount).sort((a, b) => b[1] - a[1]).slice(0, 5),
        recentEntries: allEntries.slice(0, 14), badges: allBadges,
      })
    } catch (err) { console.error('Profile fetch error:', err); setProfileError(true) }
    finally { setLoadingProfile(false) }
  }

  //  Generate report as downloadable HTML (rename to make purpose clear)
  const downloadRecoveryReport = async () => {
    setGeneratingReport(true)
    const today = new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })
    const cleanRate = stats.totalEntries > 0 ? Math.round((stats.cleanDays / stats.totalEntries) * 100) : 0
    const reportName = escapeHtml(fullName || 'N/A')
    const reportEmail = escapeHtml(email)
    const reportPhone = escapeHtml(phone ? `+254${phone}` : 'N/A')
    const reportGoal = escapeHtml(goal)
    const reportRisk = escapeHtml(riskLevel.toUpperCase())
    const reportTriggers = stats.topTriggers.map(([trigger, count]) => `<tr><td>${escapeHtml(trigger)}</td><td>${count} times</td></tr>`).join('')

    const reportHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LossLens Recovery Report - ${reportName}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: 'Georgia', serif; background: #0B1220; color: #FFFFFF; line-height: 1.8; max-width: 750px; margin: auto; padding: 1.5rem; }
  .header { text-align: center; border-bottom: 3px solid rgba(255,255,255,0.12); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .header h1 { color: #FFFFFF; margin: 0; font-size: 26px; }
  .header .subtitle { color: rgba(255,255,255,0.33); font-size: 12px; margin: 6px 0 0; }
  .header .confidential { color: rgba(255,255,255,0.08); font-size: 10px; margin: 8px 0 0; text-transform: uppercase; letter-spacing: 2px; }
  h2 { color: #FFFFFF; border-bottom: 2px solid rgba(255,255,255,0.12); padding-bottom: 8px; font-size: 18px; margin-bottom: 1rem; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .info-item { padding: 6px 0; border-bottom: 1px dotted rgba(255,255,255,0.87); }
  .info-item strong { color: #FFFFFF; display: inline-block; width: 120px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 1rem 0; }
  .stat-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 14px 10px; text-align: center; }
  .stat-card .value { font-size: 22px; font-weight: bold; color: rgba(255,255,255,0.12); display: block; }
  .stat-card .label { font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 11px; }
  th { background: rgba(255,255,255,0.12); color: #FFFFFF; padding: 10px 8px; text-align: left; font-weight: 500; font-size: 10px; }
  td { padding: 8px; border-bottom: 1px solid #FFFFFF; }
  tr:nth-child(even) { background: rgba(255,255,255,0.04); }
  .clean { color: rgba(255,255,255,0.12); font-weight: bold; }
  .gambled { color: rgba(255,255,255,0.08); font-weight: bold; }
  .footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 2px solid rgba(255,255,255,0.12); text-align: center; }
  .footer p { font-size: 10px; color: rgba(255,255,255,0.5); margin: 2px 0; }
  .badge { display: inline-block; background: rgba(255,255,255,0.12); color: #FFFFFF; padding: 3px 10px; border-radius: 4px; font-size: 10px; margin: 2px; }
</style></head><body>
<div class="header"><h1>LossLens Recovery Report</h1><p class="subtitle">Generated on ${today}</p><p class="confidential">CONFIDENTIAL — For Therapeutic Use Only</p></div>
<h2>Client Information</h2>
<div class="info-grid">
  <div class="info-item"><strong>Full Name:</strong> ${reportName}</div>
  <div class="info-item"><strong>Email:</strong> ${reportEmail}</div>
  <div class="info-item"><strong>Phone:</strong> ${reportPhone}</div>
  <div class="info-item"><strong>Goal:</strong> ${reportGoal}</div>
  <div class="info-item"><strong>Risk Level:</strong> ${reportRisk}</div>
  <div class="info-item"><strong>Member Since:</strong> ${joinedDate ? new Date(joinedDate).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</div>
  <div class="info-item"><strong>Clean Since:</strong> ${cleanSince ? new Date(cleanSince).toLocaleDateString('en-KE') : 'N/A'}</div>
  <div class="info-item"><strong>App Usage:</strong> ${totalSessions} active days  · ${stats.totalEntries} diary entries</div>
</div>
<h2>Recovery Overview</h2>
<div class="stats-grid">
  <div class="stat-card"><span class="value">${cleanRate}%</span><span class="label">Clean Rate</span></div>
  <div class="stat-card"><span class="value">${stats.cleanDays}</span><span class="label">Clean Days</span></div>
  <div class="stat-card"><span class="value">KES ${moneySaved.toLocaleString()}</span><span class="label">Money Saved</span></div>
  <div class="stat-card"><span class="value">${streakDays}</span><span class="label">Current Streak</span></div>
</div>
${stats.topTriggers.length > 0 ? `<h2>Top Triggers</h2><table><tr><th>Trigger</th><th>Frequency</th></tr>${reportTriggers}</table>` : ''}
<div class="footer"><p>Generated by LossLens — Gambling Harm Recovery Platform</p><p>Confidential — For therapeutic use only</p></div>
</body></html>`

    const blob = new Blob([reportHTML], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `LossLens-Recovery-Report-${fullName?.replace(/\s/g,'-') || 'User'}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setGeneratingReport(false)
    showToast(' Report downloaded! Open it in your browser.', 5000)
  }

  const handleProfileSave = async () => {
    setSavingProfile(true)
    try {
      await supabase.from('profiles').update({ full_name: fullName, phone: `+254${phone}`, goal }).eq('id', userId)
      showToast(' Profile updated!', 2000)
    } catch (err) { showToast('Failed to save.', 2000) }
    finally { setSavingProfile(false) }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB.', 2000); return }
    if (!file.type.startsWith('image/')) { showToast('Please upload an image.', 2000); return }
    setUploadingAvatar(true)
    try {
      const fileName = `${userId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from('avatars').createSignedUrl(fileName, 3600)
      if (signedUrlError) throw signedUrlError
      setAvatarUrl(signedUrlData.signedUrl)
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: fileName }).eq('id', userId)
      if (profileError) throw profileError
      showToast(' Photo updated!')
    } catch (err) { showToast('Upload failed.', 2000) }
    setUploadingAvatar(false)
  }

  const handleAvatarSelect = async (emoji) => {
    setAvatarUrl(emoji)
    await supabase.from('profiles').update({ avatar_url: emoji }).eq('id', userId)
    setShowAvatarPicker(false)
    showToast(' Avatar updated!')
  }

  const savePrefs = async () => {
    setSavingPrefs(true)
    try {
      await supabase.from('profiles').update({ preferences: prefs }).eq('id', userId)
      showToast('Preferences saved.', 2000)
    } catch (err) { showToast('Failed to save.', 2000) }
    setSavingPrefs(false)
  }

  const updatePassword = async () => {
    setSavingPassword(true)
    if (!passwords.next || !passwords.confirm) { showToast('Fill in all fields.', 2000); setSavingPassword(false); return }
    if (passwords.next.length < 8) { showToast('Min 8 characters.', 2000); setSavingPassword(false); return }
    if (passwords.next !== passwords.confirm) { showToast("Passwords don't match.", 2000); setSavingPassword(false); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: passwords.current })
      if (signInError) { showToast('Current password incorrect.', 2000); setSavingPassword(false); return }
      const { error } = await supabase.auth.updateUser({ password: passwords.next })
      if (error) { showToast(error.message, 2000); setSavingPassword(false); return }
      showToast(' Password updated!', 3000)
      setPasswords({ current: '', next: '', confirm: '' })
    } catch (err) { showToast('Failed.', 2000) }
    setSavingPassword(false)
  }

  const startMfaEnrollment = async () => {
    setMfaLoading(true)
    setMfaError('')
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'LossLens authenticator',
    })
    if (error) {
      console.error('MFA enrollment failed:', error)
      setMfaError('Could not start authenticator setup. Please try again.')
    } else {
      setMfaEnrollment(data)
      setMfaCode('')
    }
    setMfaLoading(false)
  }

  const verifyMfaEnrollment = async () => {
    if (!mfaEnrollment?.id || !mfaCode.trim()) return
    setMfaLoading(true)
    setMfaError('')
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaEnrollment.id,
    })
    if (challengeError) {
      console.error('MFA challenge failed:', challengeError)
      setMfaError('Could not verify the authenticator code. Please try again.')
      setMfaLoading(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaEnrollment.id,
      challengeId: challenge.id,
      code: mfaCode.trim(),
    })
    if (verifyError) {
      console.error('MFA verification failed:', verifyError)
      setMfaError('That code could not be verified. Check it and try again.')
    } else {
      setMfaEnabled(true)
      setMfaEnrollment(null)
      setMfaCode('')
      showToast('Authenticator enabled.', 2500)
    }
    setMfaLoading(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteStep < 2) { setDeleteStep(prev => prev + 1); setDeleteInput(''); return }
    if (deleteInput !== 'DELETE') { showToast('Type DELETE to confirm', 2000); return }
    setDeletingAccount(true)
    try {
      const { error: deleteError } = await supabase.functions.invoke('delete-account', { body: { action: 'self-delete' } })
      if (deleteError) throw deleteError
      await supabase.auth.signOut()
      sessionStorage.removeItem('elevated_unlocked_at')
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Account deletion failed:', err)
      showToast('Delete failed. Try again.', 2000)
      setDeletingAccount(false)
    }
  }

  const handleSignOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      console.error('Sign-out failed:', signOutError)
      showToast('Could not sign out. Please try again.')
      return
    }
    sessionStorage.removeItem('elevated_unlocked_at')
    navigate('/login', { replace: true })
  }

  const handleBadgeClick = (badge) => {
    if (!badge) return
    if (badge.category === 'learning') navigate('/cbt')
    else if (badge.category === 'engagement') navigate('/diary')
    else navigate('/dashboard')
  }

  //  Memoized derived values
  const initials = useMemo(() => fullName.split(' ').map(n => n[0]).join('').toUpperCase() || 'x', [fullName])
  const cleanRate = useMemo(() => stats.totalEntries > 0 ? Math.round((stats.cleanDays / stats.totalEntries) * 100) : 0, [stats])
  const earnedBadges = useMemo(() => stats.badges.filter(b => b.earned).length, [stats.badges])

  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <AppIcon name="alert" size={56} style={{ display: 'block', margin: '0 auto 16px', color: '#2DD4BF' }} />
          <h2 style={{ color: '#2DD4BF', fontFamily: 'var(--font-display)' }}>Please log in</h2>
          <button onClick={() => navigate('/login', { replace: true })} style={{ padding: '14px 32px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%', marginTop: '16px' }}>Go to Login →</button>
        </div>
      </div>
    )
  }

  if (loadingProfile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
      </div>
    )
  }

  if (profileError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', marginBottom: '12px' }}>Could not load your profile.</p>
        <button type="button" className="btn-primary" onClick={() => { setLoadingProfile(true); setProfileError(false); fetchAllData() }}>Try again</button>
      </div>
    )
  }

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }} className="page-content">

        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem',  }}>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> My Profile</h1>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{fullName || 'Complete your profile'}</p>
          </div>
        </div>

        <div style={{ padding: '1rem', maxWidth: '650px', margin: '0 auto' }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '0.75rem' }}>
            {[
              { icon: '', value: streakDays, label: 'Streak' },
              { icon: '', value: `KES ${Math.floor(moneySaved/1000)}k`, label: 'Saved' },
              { icon: '', value: `${cleanRate}%`, label: 'Clean' },
              { icon: '', value: `${stats.cbtCompleted}/${stats.cbtTotal}`, label: 'CBT' },
            ].map((s, i) => (
              <div className="stat-card" key={i} style={{ padding: '10px 8px', textAlign: 'center', minHeight: '70px' }}>
                <span style={{ fontSize: '16px' }}>{s.icon}</span>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#2DD4BF', fontFamily: 'var(--font-display)' }}>{s.value}</span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Badges */}
          {stats.badges.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}> Badges ({earnedBadges}/{stats.badges.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px' }}>
                {stats.badges.map(b => (
                  <button type="button" key={b.id} className="clickable" onClick={() => handleBadgeClick(b)}
                    style={{ padding: '8px 6px', borderRadius: '8px', cursor: 'pointer', background: b.earned ? 'rgba(255,255,255,0.12)' : '#0B1220', border: `1px solid ${b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`, opacity: b.earned ? 1 : 0.4, textAlign: 'center', transition: 'all 0.2s', minHeight: '60px', width: '100%', font: 'inherit', color: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}
                    title={b.earned ? `${b.name} — Click to explore` : `${b.name} (Locked)`}>
                    <span style={{ fontSize: '20px', display: 'block' }}>{b.earned ? b.emoji : ''}</span>
                    <span style={{ fontSize: '9px', color: b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.4)', display: 'block', marginTop: '3px' }}>{b.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Report Section */}
          <div className="dash-section" style={{ marginBottom: '0.75rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', borderColor: '#2DD4BF' }}>
            <h3 style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '0.75rem' }}> Recovery Report</h3>

            <p style={{ color: '#7DBDEE', fontSize: '11px', lineHeight: '1.5', marginBottom: '12px' }}>Your professional recovery report is ready. Download it to share with your therapist or counselor.</p>
            <button onClick={downloadRecoveryReport} disabled={generatingReport} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {generatingReport ? <span className="spinner"></span> : 'Download Report'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.12)' }}>
            {[{ id: TABS.PROFILE, label: ' Profile' }, { id: TABS.SETTINGS, label: ' Prefs' }, { id: TABS.SECURITY, label: ' Security' }, { id: TABS.DATA, label: ' Data' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px 6px', borderRadius: '8px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', minHeight: '44px' }}>{tab.label}</button>
            ))}
          </div>

          {/* PROFILE TAB */}
          {activeTab === TABS.PROFILE && (
            <>
              <div className="dash-section" style={{ marginBottom: '0.75rem', textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button type="button" className="card-action" aria-label="Change avatar" onClick={() => setShowAvatarPicker(!showAvatarPicker)} style={{ borderRadius: '50%' }} />
                  {avatarUrl && avatarUrl.startsWith('http') ? <img src={avatarUrl} alt="Avatar" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #2DD4BF' }} />
                  : avatarUrl ? <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{avatarUrl}</div>
                  : <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #7DBDEE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700, color: '#2DD4BF', fontFamily: 'var(--font-display)' }}>{initials}</div>}
                  <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#2DD4BF', color: '#0B1220', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', border: '2px solid #0B1220' }}></div>
                </div>
                {showAvatarPicker && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {AVATAR_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={() => handleAvatarSelect(emoji)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: avatarUrl === emoji ? 'rgba(255,255,255,0.12)' : '#0B1220', border: avatarUrl === emoji ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)', fontSize: '20px', cursor: 'pointer' }} aria-label={`Select ${emoji} avatar`}>{emoji}</button>
                      ))}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', minHeight: '44px' }}>{uploadingAvatar ? 'Uploading...' : ' Upload photo'}</button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                  </div>
                )}
              </div>

              <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group"><label>Full name</label><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={email} disabled style={{ opacity: 0.5 }} /></div>
                <div className="form-group"><label>Phone</label><div className="phone-input"><span className="phone-prefix">🇰🇪 +254</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace('+254', ''))} placeholder="7XX XXX XXX" /></div></div>
              </div>
              <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: '#2DD4BF', fontSize: '12px', marginBottom: '8px', display: 'block' }}>My goal</label>
                <div className="chip-group">{['Cut down', 'Abstinence', 'Maintenance'].map(g => <button key={g} className={`chip ${goal === g ? 'chip-active' : ''}`} onClick={() => setGoal(g)}>{g}</button>)}</div>
              </div>
              <button className="btn-primary full" onClick={handleProfileSave} disabled={savingProfile} style={{ fontSize: '12px', padding: '10px', minHeight: '44px' }}>{savingProfile ? 'Saving...' : 'Save changes'}</button>
            </>
          )}

          {/* SETTINGS TAB */}
          {activeTab === TABS.SETTINGS && (
            <>
              <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}>Privacy</h3>
                {[{ label: 'Behavioral analytics', key: 'allow_analytics' }, { label: 'Share anonymized data', key: 'share_research_data' }, { label: 'M-Pesa monitoring', key: 'mpesa_monitoring' }].map(item => (
                  <div className="toggle-row" key={item.key}><span className="toggle-label">{item.label}</span><input type="checkbox" className="toggle-check" checked={prefs[item.key]} onChange={e => setPrefs(prev => ({ ...prev, [item.key]: e.target.checked }))} /></div>
                ))}
              </div>
              <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}>Appearance</h3>
                <div className="toggle-row"><span className="toggle-label">Low-data mode</span><input type="checkbox" className="toggle-check" checked={prefs.low_data_mode} onChange={e => setPrefs(prev => ({ ...prev, low_data_mode: e.target.checked }))} /></div>
              </div>
              <button className="btn-primary full" onClick={savePrefs} disabled={savingPrefs} style={{ fontSize: '12px', padding: '10px', minHeight: '44px' }}>{savingPrefs ? 'Saving...' : 'Save preferences'}</button>
            </>
          )}

          {/* SECURITY TAB */}
          {activeTab === TABS.SECURITY && (
            <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}>Change password</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '0.75rem' }}>Enter your current password and set a new one.</p>
              {['current','next','confirm'].map(field => (
                <div className="form-group" key={field}><label>{field === 'current' ? 'Current' : field === 'next' ? 'New (min 8 chars)' : 'Confirm'}</label><input type="password" placeholder="Enter password" value={passwords[field]} onChange={e => setPasswords({ ...passwords, [field]: e.target.value })} /></div>
              ))}
              <button className="btn-primary full" onClick={updatePassword} disabled={savingPassword} style={{ fontSize: '12px', padding: '10px', minHeight: '44px' }}>{savingPassword ? 'Updating...' : 'Update password'}</button>
              <hr style={{ borderColor: 'rgba(255,255,255,0.12)', margin: '1rem 0' }} />
              <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}>Two-factor authentication</h3>
              {mfaEnabled ? (
                <p role="status" style={{ color: '#2DD4BF', fontSize: '11px' }}>An authenticator app is enabled for this account.</p>
              ) : mfaEnrollment ? (
                <div>
                  {mfaEnrollment.totp?.qr_code && <img src={mfaEnrollment.totp.qr_code} alt="Scan this QR code with your authenticator app" style={{ display: 'block', width: '160px', maxWidth: '100%', margin: '12px auto', background: '#FFFFFF', padding: '8px', borderRadius: '8px' }} />}
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', wordBreak: 'break-all' }}>Manual setup key: {mfaEnrollment.totp?.secret}</p>
                  <div className="form-group"><label htmlFor="mfa-code">6-digit authenticator code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={event => setMfaCode(event.target.value)} /></div>
                  <button className="btn-primary full" type="button" onClick={verifyMfaEnrollment} disabled={mfaLoading || !mfaCode.trim()}>{mfaLoading ? 'Verifying...' : 'Verify and enable'}</button>
                </div>
              ) : (
                <button className="btn-ghost full" type="button" onClick={startMfaEnrollment} disabled={mfaLoading}>{mfaLoading ? 'Starting setup...' : 'Set up an authenticator app'}</button>
              )}
              {mfaError && <p role="alert" style={{ color: '#ff9b9b', fontSize: '11px', marginTop: '8px' }}>{mfaError}</p>}
            </div>
          )}

          {/* DATA TAB */}
          {activeTab === TABS.DATA && (
            <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: 'rgba(255,255,255,0.08)' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.5rem' }}>Delete my data</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', lineHeight: '1.5', marginBottom: '0.75rem' }}>Permanently delete your profile, diary entries ({stats.totalEntries}), and all data.</p>
              {!showDeleteConfirm ? (
                <button className="btn-danger full" style={{ fontSize: '12px', padding: '10px', minHeight: '44px' }} onClick={() => setShowDeleteConfirm(true)}>I want to delete my data</button>
              ) : (
                <div>
                  {/* Step indicator */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px' }}>
                    {[0, 1, 2].map(s => <div key={s} style={{ width: '24px', height: '4px', borderRadius: '2px', background: deleteStep >= s ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} />)}
                  </div>
                  {deleteStep === 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#FFFFFF', fontSize: '11px', marginBottom: '0.75rem' }}>Are you sure? This cannot be undone.</p>
                      <div style={{ display: 'flex', gap: '6px' }}><button className="btn-ghost" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button><button className="btn-danger" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setDeleteStep(1)}>Continue</button></div>
                    </div>
                  )}
                  {deleteStep === 1 && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#FFFFFF', fontSize: '11px', marginBottom: '0.75rem', lineHeight: '1.5' }}>Deletes: account, diary entries ({stats.totalEntries}), CBT progress, all data.</p>
                      <div style={{ display: 'flex', gap: '6px' }}><button className="btn-ghost" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setDeleteStep(0)}>← Back</button><button className="btn-danger" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setDeleteStep(2)}>I understand</button></div>
                    </div>
                  )}
                  {deleteStep === 2 && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#FFFFFF', fontSize: '11px', marginBottom: '0.5rem' }}>Type <strong>DELETE</strong></p>
                      <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="Type DELETE here" style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0B1220', border: '2px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--font-body)', outline: 'none', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
                      <button className="btn-danger full" onClick={handleDeleteAccount} disabled={deletingAccount || deleteInput !== 'DELETE'} style={{ fontSize: '12px', padding: '10px', minHeight: '44px', opacity: deleteInput === 'DELETE' ? 1 : 0.5 }}>{deletingAccount ? 'Deleting...' : 'Permanently delete'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button className="btn-ghost full" onClick={handleSignOut} style={{ fontSize: '11px', padding: '10px', marginTop: '0.5rem', minHeight: '44px' }}>Sign out</button>
        </div>
      </div>
      <style>{`
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
