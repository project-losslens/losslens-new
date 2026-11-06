import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

//  Constants
const TABS = { PROFILE: 'profile', SETTINGS: 'settings', SECURITY: 'security', DATA: 'data' }
const AVATAR_OPTIONS = ['', '', '', '', '', '', '', '', '', '']
const REPORT_PASSWORD_WORDS = ['River', 'Mountain', 'Forest', 'Ocean', 'Sunset', 'Dawn', 'Star', 'Moon', 'Cloud', 'Lake']

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

//  Cryptographically secure password generator
function generatePassword() {
  const word = REPORT_PASSWORD_WORDS[Math.floor(Math.random() * REPORT_PASSWORD_WORDS.length)]
  const num = Math.floor(Math.random() * 99) + 1
  return `${word}${num}`
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
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [joinedDate, setJoinedDate] = useState(null)
  const [totalSessions, setTotalSessions] = useState(0)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Report
  const [reportUnlocked, setReportUnlocked] = useState(() => sessionStorage.getItem('report_unlocked') === 'true')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [reportPassword, setReportPassword] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Stats
  const [stats, setStats] = useState({ totalEntries: 0, cleanDays: 0, gambleDays: 0, cbtCompleted: 0, cbtTotal: 8, eventsAttended: 0, topTriggers: [], topCoping: [], recentEntries: [], badges: [] })

  // Preferences
  const [prefs, setPrefs] = useState({ allow_analytics: false, share_research_data: false, mpesa_monitoring: false, low_data_mode: false, language: 'English' })
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Password change
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)

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
        setAvatarUrl(profile.avatar_url || '')
        setJoinedDate(profile.created_at || null)
        if (profile.preferences) setPrefs(prev => ({ ...prev, ...profile.preferences }))
        if (profile.report_password) setReportPassword(profile.report_password)
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
    } catch (err) { console.error('Profile fetch error:', err) }
    finally { setLoadingProfile(false) }
  }

  const getOrCreatePassword = useCallback(async () => {
    if (reportPassword) return reportPassword
    const pw = generatePassword()
    setReportPassword(pw)
    await supabase.from('profiles').update({ report_password: pw }).eq('id', userId)
    return pw
  }, [reportPassword, userId])

  const handlePasswordSubmit = async () => {
    const pw = await getOrCreatePassword()
    if (passwordInput === pw) {
      setReportUnlocked(true)
      setPasswordError('')
      sessionStorage.setItem('report_unlocked', 'true')
    } else {
      setPasswordError('Incorrect password.')
      setPasswordInput('')
    }
  }

  //  Generate report as downloadable HTML (rename to make purpose clear)
  const downloadRecoveryReport = async () => {
    setGeneratingReport(true)
    const pw = await getOrCreatePassword()
    const today = new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })
    const cleanRate = stats.totalEntries > 0 ? Math.round((stats.cleanDays / stats.totalEntries) * 100) : 0

    const reportHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LossLens Recovery Report - ${fullName}</title>
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
  <div class="info-item"><strong>Full Name:</strong> ${fullName || 'N/A'}</div>
  <div class="info-item"><strong>Email:</strong> ${email}</div>
  <div class="info-item"><strong>Phone:</strong> +254${phone || 'N/A'}</div>
  <div class="info-item"><strong>Goal:</strong> ${goal}</div>
  <div class="info-item"><strong>Risk Level:</strong> ${riskLevel.toUpperCase()}</div>
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
${stats.topTriggers.length > 0 ? `<h2>Top Triggers</h2><table><tr><th>Trigger</th><th>Frequency</th></tr>${stats.topTriggers.map(([t,c]) => `<tr><td>${t}</td><td>${c} times</td></tr>`).join('')}</table>` : ''}
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

  const sendPasswordEmail = async () => {
    if (!email) { showToast('No email on file.', 3000); return }
    setSendingEmail(true)
    setEmailSent(false)
    const pw = await getOrCreatePassword()
    try {
      const res = await fetch('https://kepsxjmolzurvdnxgcby.supabase.co/functions/v1/send-invite', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, supporterName: fullName || 'User', userName: 'LossLens', inviteLink: pw, type: 'report' })
      })
      if (res.ok) { setEmailSent(true); showToast(' Password sent! Check your inbox.', 5000) }
      else showToast('⚠️ Failed to send.', 4000)
    } catch { showToast('⚠️ Network error.', 4000) }
    setSendingEmail(false)
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
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      setAvatarUrl(publicUrl)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
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

  const handleDeleteAccount = async () => {
    if (deleteStep < 2) { setDeleteStep(prev => prev + 1); setDeleteInput(''); return }
    if (deleteInput !== 'DELETE') { showToast('Type DELETE to confirm', 2000); return }
    setDeletingAccount(true)
    try {
      await supabase.from('profiles').delete().eq('id', userId)
      await supabase.auth.signOut()
      sessionStorage.clear()
      navigate('/')
    } catch (err) { showToast('Delete failed. Try again.', 2000); setDeletingAccount(false) }
  }

  const handleSignOut = async () => {
    sessionStorage.clear()
    await supabase.auth.signOut()
    navigate('/login')
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
          <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }}></span>
          <h2 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>Please log in</h2>
          <button onClick={() => navigate('/login', { replace: true })} style={{ padding: '14px 32px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", width: '100%', marginTop: '16px' }}>Go to Login →</button>
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

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0, overflowX: 'hidden' }} className="main-content">

        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#0B1220', borderBottom: '1px solid rgba(255,255,255,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> My Profile</h1>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{fullName || 'Complete your profile'}</p>
          </div>
        </nav>

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
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>{s.value}</span>
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
                  <div key={b.id} onClick={() => handleBadgeClick(b)}
                    style={{ padding: '8px 6px', borderRadius: '8px', cursor: 'pointer', background: b.earned ? 'rgba(255,255,255,0.12)' : '#0B1220', border: `1px solid ${b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`, opacity: b.earned ? 1 : 0.4, textAlign: 'center', transition: 'all 0.2s', minHeight: '60px' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}
                    title={b.earned ? `${b.name} — Click to explore` : `${b.name} (Locked)`}>
                    <span style={{ fontSize: '20px', display: 'block' }}>{b.earned ? b.emoji : ''}</span>
                    <span style={{ fontSize: '9px', color: b.earned ? '#2DD4BF' : 'rgba(255,255,255,0.4)', display: 'block', marginTop: '3px' }}>{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report Section */}
          <div className="dash-section" style={{ marginBottom: '0.75rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', borderColor: '#2DD4BF' }}>
            <h3 style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '0.75rem' }}> Recovery Report</h3>

            {!reportUnlocked ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
                <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '4px' }}>This report is password protected</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '16px' }}>Enter your report password to view and download</p>
                <div style={{ maxWidth: '280px', margin: '0 auto 12px' }}>
                  <input type="password" placeholder="Enter password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: `2px solid ${passwordError ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}`, color: '#FFFFFF', fontSize: '13px', textAlign: 'center', letterSpacing: '3px', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                    autoFocus aria-label="Report password" />
                </div>
                {passwordError && <p style={{ color: '#FFFFFF', fontSize: '11px', marginBottom: '12px' }}>{passwordError}</p>}
                <button onClick={handlePasswordSubmit} disabled={!passwordInput} style={{ padding: '10px 28px', borderRadius: '100px', background: passwordInput ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: passwordInput ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: 600, cursor: passwordInput ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>Unlock Report </button>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '12px' }}>Don't know your password? We'll email it to you.</p>
                <button onClick={sendPasswordEmail} disabled={sendingEmail || !email} style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{sendingEmail ? 'Sending...' : emailSent ? ' Sent!' : ' Email me the password'}</button>
              </div>
            ) : (
              <>
                <p style={{ color: '#7DBDEE', fontSize: '11px', lineHeight: '1.5', marginBottom: '12px' }}>Your professional recovery report is ready. Download it to share with your therapist or counselor.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={downloadRecoveryReport} disabled={generatingReport} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                    {generatingReport ? <span className="spinner"></span> : ' Download Report'}
                  </button>
                </div>
                <button onClick={() => { setReportUnlocked(false); sessionStorage.removeItem('report_unlocked') }} style={{ marginTop: '8px', width: '100%', padding: '6px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Lock report again</button>
              </>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.12)' }}>
            {[{ id: TABS.PROFILE, label: ' Profile' }, { id: TABS.SETTINGS, label: ' Prefs' }, { id: TABS.SECURITY, label: ' Security' }, { id: TABS.DATA, label: ' Data' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px 6px', borderRadius: '8px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", minHeight: '44px' }}>{tab.label}</button>
            ))}
          </div>

          {/* PROFILE TAB */}
          {activeTab === TABS.PROFILE && (
            <>
              <div className="dash-section" style={{ marginBottom: '0.75rem', textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }} onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
                  {avatarUrl && avatarUrl.startsWith('http') ? <img src={avatarUrl} alt="Avatar" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #2DD4BF' }} />
                  : avatarUrl ? <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{avatarUrl}</div>
                  : <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #7DBDEE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700, color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>{initials}</div>}
                  <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#2DD4BF', color: '#0B1220', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', border: '2px solid #0B1220' }}></div>
                </div>
                {showAvatarPicker && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {AVATAR_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={() => handleAvatarSelect(emoji)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: avatarUrl === emoji ? 'rgba(255,255,255,0.12)' : '#0B1220', border: avatarUrl === emoji ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)', fontSize: '20px', cursor: 'pointer' }} aria-label={`Select ${emoji} avatar`}>{emoji}</button>
                      ))}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", minHeight: '44px' }}>{uploadingAvatar ? 'Uploading...' : ' Upload photo'}</button>
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
                      <div style={{ display: 'flex', gap: '6px' }}><button className="btn-ghost" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setDeleteStep(0)}>â"   Back</button><button className="btn-danger" style={{ flex: 1, fontSize: '11px', minHeight: '44px' }} onClick={() => setDeleteStep(2)}>I understand</button></div>
                    </div>
                  )}
                  {deleteStep === 2 && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#FFFFFF', fontSize: '11px', marginBottom: '0.5rem' }}>Type <strong>DELETE</strong></p>
                      <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="Type DELETE here" style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0B1220', border: '2px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', textAlign: 'center', fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
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
