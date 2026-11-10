import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../i18n'
import { enqueueOfflineItem, offlineQueueCount, onOfflineQueueChange } from '../../lib/offlineQueue'

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

function triggerConfetti() {
  const colors = ['#2DD4BF', '#2DD4BF', '#2DD4BF', '#FFFFFF', '#7DBDEE', '#7DBDEE']
  for (let i = 0; i < 40; i++) {
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
    }, i * 25)
  }
}

function Diary() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [pendingSync, setPendingSync] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState(null)
  const [todayEntry, setTodayEntry] = useState(null)
  const [gambled, setGambled] = useState(null)
  const [mood, setMood] = useState('')
  const [urgeLevel, setUrgeLevel] = useState(null)
  const [triggers, setTriggers] = useState([])
  const [coping, setCoping] = useState([])
  const [notes, setNotes] = useState('')
  const [timeSpent, setTimeSpent] = useState('')
  const [moneySpent, setMoneySpent] = useState('')
  const [moneyWon, setMoneyWon] = useState('')
  const [gamblingType, setGamblingType] = useState('')
  const [showCheckmark, setShowCheckmark] = useState(false)
  const [profile, setProfile] = useState(null)
  const [saveError, setSaveError] = useState('')

  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef(null)

  const [historyEntries, setHistoryEntries] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [activeView, setActiveView] = useState('today')
  const [stats, setStats] = useState({ totalEntries: 0, cleanDays: 0, gambleDays: 0, cleanRate: 0, topTriggers: [], topCoping: [] })

  const moods = ['Calm', 'Stressed', 'Anxious', 'Depressed', 'Happy']
  const triggerOptions = ['Boredom', 'Stress', 'Social Pressure', 'Financial Pressure', 'Celebration', 'Ads/Promotions', 'Other']
  const copingOptions = ['Breathing', 'Left Situation', 'Called Someone', 'App Tools', 'Exercise', 'Other']
  const gamblingTypes = ['Sports Betting', 'Casino', 'Lottery', 'Online', 'Other']

  useEffect(() => {
    fetchSession()
    checkVoiceSupport()
    const refreshPending = () => { void offlineQueueCount().then(setPendingSync) }
    refreshPending()
    const unsubscribe = onOfflineQueueChange(refreshPending)
    return () => { stopListening(); unsubscribe() }
  }, [])

  const checkVoiceSupport = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) setVoiceSupported(true)
  }

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-KE'
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript
      setNotes(prev => {
        if (event.results[event.results.length - 1].isFinal) return (prev || '') + ' ' + transcript.trim()
        return transcript
      })
    }
    recognition.onerror = () => { setIsListening(false) }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const stopListening = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null }
    setIsListening(false)
  }

  const fetchSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUserId(session.user.id)
    fetchTodayEntry(session.user.id)
    fetchHistory(session.user.id)
    fetchProfile(session.user.id)
  }

  const fetchProfile = async (uid) => {
    const { data } = await supabase.from('profiles').select('streak_days, money_saved, streak_freeze_used').eq('id', uid).single()
    setProfile(data)
  }

  const fetchTodayEntry = async (uid) => {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('diary_entries').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (data) {
      setTodayEntry(data)
      setGambled(data.gambled)
      setMood((data.mood || '').trim())
      setTriggers(data.triggers || [])
      setCoping(data.coping || [])
      setNotes(data.notes || '')
      setTimeSpent(data.time_spent || '')
      setMoneySpent(data.money_spent || '')
      setMoneyWon(data.money_won || '')
      setGamblingType(data.gambling_type || '')
    }
  }

  const fetchHistory = async (uid) => {
    setHistoryLoading(true)
    setHistoryError(false)
    try {
      const { data, error } = await supabase.from('diary_entries').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(30)
      if (error) throw error
      const entries = data || []
    setHistoryEntries(entries)
    const total = entries.length
    const clean = entries.filter(e => !e.gambled).length
    const gamble = entries.filter(e => e.gambled).length
    const rate = total > 0 ? Math.round((clean / total) * 100) : 0
    const tc = {}; entries.forEach(e => { (e.triggers || []).forEach(t => tc[t] = (tc[t] || 0) + 1) })
    const cc = {}; entries.forEach(e => { (e.coping || []).forEach(c => cc[c] = (cc[c] || 0) + 1) })
    setStats({ totalEntries: total, cleanDays: clean, gambleDays: gamble, cleanRate: rate, topTriggers: Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 5), topCoping: Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 5) })
    } catch (err) {
      console.error('Diary history fetch error:', err)
      setHistoryError(true)
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleItem = (item, list, setList) => {
    if (list.includes(item)) setList(list.filter(i => i !== item))
    else setList([...list, item])
  }

  const handleSave = async () => {
    setSaveError('')
    if (gambled === null) { showToast(t('diary.selectGambled'), 2000); return }
    if (!userId) { showToast(t('diary.loginAgain'), 2000); return }

    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const payload = {
      user_id: userId,
      date: today,
      gambled: gambled || false,
      gambling_type: gamblingType || null,
      time_spent: timeSpent ? parseFloat(timeSpent) : null,
      money_spent: moneySpent ? parseFloat(moneySpent) : null,
      money_won: moneyWon ? parseFloat(moneyWon) : null,
      mood: (mood || '').trim() || null,
      ...(urgeLevel !== null ? { urge_level: urgeLevel } : {}),
      triggers: triggers || [],
      coping: coping || [],
      notes: notes || null,
    }

    let error = null

    if (todayEntry) {
      const { error: updateError } = await supabase.from('diary_entries').update(payload).eq('id', todayEntry.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('diary_entries').insert(payload)
      error = insertError
    }

    if (error) {
      console.error('Save error:', error)
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      if (offline || /fetch|network|Failed to fetch|Load failed/i.test(error.message || '')) {
        await enqueueOfflineItem('diary_entry', payload)
        setPendingSync(await offlineQueueCount())
        setLoading(false)
        setSaved(true)
        setShowCheckmark(true)
        showToast(t('common.offlineSaved'), 5000)
        setTimeout(() => { setSaved(false); setShowCheckmark(false) }, 2000)
        return
      }
      setSaveError(error.message || t('diary.saveFailed'))
      setLoading(false)
      showToast(` ${t('diary.saveFailed')}`, 3000)
      return
    }

    if (notes.trim()) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch('/api/crisis', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: notes }),
        }).then(async response => {
          if (!response.ok) {
            console.error('Diary crisis event recording failed:', response.status, await response.text())
          }
        }).catch(crisisEventError => {
          console.error('Diary crisis event recording failed:', crisisEventError)
        })
      }
    }

    // Recompute streak/money/badges server-side (privileged fields).
    let recomputed = null
    try {
      const { recomputeProgress, checkBadges } = await import('../../lib/gamification')
      recomputed = await recomputeProgress()
      if (recomputed?.freeze_activated) {
        showToast(t('diary.freezeActivated'), 4000)
      }
      const earnedBadges = await checkBadges(userId) || []
      if (earnedBadges.length > 0) {
        triggerConfetti()
        earnedBadges.forEach(b => showToast(t('diary.badgeEarned', { name: b.name }), 4000))
      }
      // Streak milestone celebration — once per milestone per user.
      const MILESTONES = [1, 7, 14, 30, 60, 90]
      const newStreak = recomputed?.streak_days
      if (newStreak && MILESTONES.includes(newStreak)) {
        const key = `ll_streak_milestone_${userId}_${newStreak}`
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1')
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) triggerConfetti()
          showToast(t('diary.milestone', { count: newStreak }), 5000)
        }
      }
    } catch (err) {
      console.error('Gamification error:', err)
    }
    fetchHistory(userId)
    if (recomputed) fetchProfile(userId)

    setLoading(false)
    setSaved(true)
    setShowCheckmark(true)
    setSaveError('')

    if (!gambled && !error) { triggerConfetti(); showToast(` ${t('diary.cleanDayLogged')}`, 3000) }
    else showToast(` ${t('diary.entrySaved')}`, 3000)

    setTimeout(() => { setSaved(false); setShowCheckmark(false) }, 2000)
  }

  // Profile progress fields are recomputed server-side via recompute_progress().

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div>
            <h1 className="fs-18" style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> {t('diary.title')}</h1>
            <p className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {pendingSync > 0 && (
            <p className="fs-13" role="status" style={{ background: 'rgba(125,189,238,0.12)', border: '1px solid #7DBDEE', borderRadius: '8px', padding: '10px 14px', color: '#7DBDEE', marginBottom: '1rem' }}>
              {pendingSync} {t('common.offlineSaved')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <button onClick={() => setActiveView('today')} className="fs-13" style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeView === 'today' ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeView === 'today' ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontWeight: activeView === 'today' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> {t('diary.today')}</button>
            <button onClick={() => setActiveView('history')} className="fs-13" style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeView === 'history' ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeView === 'history' ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontWeight: activeView === 'history' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> {t('diary.history')} {stats.totalEntries > 0 ? `(${stats.totalEntries})` : ''}</button>
          </div>

          {activeView === 'today' && (
            <>
              {showCheckmark && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '3px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'checkmarkPop 0.5s ease-out' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <p className="fs-14" style={{ color: '#2DD4BF', marginTop: '12px', fontWeight: 500 }}>{gambled ? t('diary.checkSaved') : t('diary.checkClean')}</p>
                </div>
              )}

              {saveError && (
                <div className="fs-13" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', marginBottom: '1rem' }}>
                  {saveError}
                </div>
              )}

              <div className="dash-section">
                <h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}> {t('diary.gambledTitle')}</h3>
                <div className="toggle-group">
                  <button className={`toggle-btn ${gambled === false ? 'active-primary' : ''}`} onClick={() => { setGambled(false); showToast(` ${t('diary.cleanDayLogged')}`, 1500) }}> {t('diary.no')}</button>
                  <button className={`toggle-btn ${gambled === true ? 'active-alert' : ''}`} onClick={() => setGambled(true)}> {t('diary.yes')}</button>
                </div>
              </div>

              {gambled && (
                <div className="dash-section" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}>{t('diary.gamblingDetails')}</h3>
                  <div className="form-group"><label>{t('diary.type')}</label><div className="chip-group">{gamblingTypes.map(type => <button key={type} className={`chip ${gamblingType === type ? 'chip-active' : ''}`} onClick={() => setGamblingType(type)}>{t(`diary.type.${type}`)}</button>)}</div></div>
                  <div className="form-row">
                    <div className="form-group"><label>{t('diary.time')}</label><input type="number" placeholder="2" value={timeSpent} onChange={e => setTimeSpent(e.target.value)} /></div>
                    <div className="form-group"><label>{t('diary.spent')}</label><input type="number" placeholder="500" value={moneySpent} onChange={e => setMoneySpent(e.target.value)} /></div>
                    <div className="form-group"><label>{t('diary.won')}</label><input type="number" placeholder="0" value={moneyWon} onChange={e => setMoneyWon(e.target.value)} /></div>
                  </div>
                </div>
              )}

              <div className="dash-section"><h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}> {t('diary.urgeTitle')} <span className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{t('diary.urgeHint')}</span></h3><div className="chip-group">{Array.from({ length: 11 }, (_, i) => <button key={i} type="button" className={`chip ${urgeLevel === i ? 'chip-active' : ''}`} onClick={() => setUrgeLevel(urgeLevel === i ? null : i)}>{i}</button>)}</div></div>
              <div className="dash-section"><h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}>{t('diary.moodTitle')}</h3><div className="chip-group">{moods.map(m => <button key={m} className={`chip ${mood.trim() === m ? 'chip-active' : ''}`} onClick={() => setMood(m)}>{t(`diary.mood.${m}`)}</button>)}</div></div>
              <div className="dash-section"><h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}>{t('diary.triggersTitle')}</h3><div className="chip-group">{triggerOptions.map(trigger => <button key={trigger} className={`chip ${triggers.includes(trigger) ? 'chip-active' : ''}`} onClick={() => toggleItem(trigger, triggers, setTriggers)}>{t(`diary.trigger.${trigger}`)}</button>)}</div></div>
              <div className="dash-section"><h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}>{t('diary.copingTitle')}</h3><div className="chip-group">{copingOptions.map(c => <button key={c} className={`chip ${coping.includes(c) ? 'chip-active' : ''}`} onClick={() => toggleItem(c, coping, setCoping)}>{t(`diary.coping.${c}`)}</button>)}</div></div>

              <div className="dash-section">
                <h3 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '1rem' }}> {t('diary.notesTitle')}</h3>
                {voiceSupported && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px 12px', background: isListening ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)', borderRadius: '8px', border: `1px solid ${isListening ? '#FFFFFF' : '#7DBDEE'}` }}>
                    <button onClick={() => isListening ? stopListening() : startListening()} className="fs-16" style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: isListening ? '#FFFFFF' : '#2DD4BF', color: '#0B1220', cursor: 'pointer', animation: isListening ? 'pulse 1.5s infinite' : 'none' }}></button>
                    <span className="fs-12" style={{ flex: 1, color: isListening ? '#FFFFFF' : '#2DD4BF' }}>{isListening ? ` ${t('diary.listening')}` : ` ${t('diary.speak')}`}</span>
                    {isListening && <button type="button" onClick={stopListening} className="fs-18" style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer' }} aria-label={t('diary.listening')}>⏹</button>}
                  </div>
                )}
                <textarea className="diary-textarea" placeholder={t('diary.notesPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
              </div>

              <button className="btn-primary full" onClick={handleSave} disabled={loading || saved || gambled === null}>
                {loading ? <span className="spinner"></span> : saved ? ` ${t('diary.savedCheck')}` : todayEntry ? ` ${t('diary.updateEntry')}` : ` ${t('diary.saveEntry')}`}
              </button>
            </>
          )}

          {activeView === 'history' && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                {[{ icon: '', value: stats.totalEntries, label: t('diary.total') }, { icon: '', value: `${stats.cleanRate}%`, label: t('diary.cleanRate'), hl: stats.cleanRate >= 70 }, { icon: '', value: stats.cleanDays, label: t('diary.cleanDays') }, { icon: '', value: stats.gambleDays, label: t('diary.gambleDays') }].map((s, i) => (
                  <div className="stat-card" key={i} style={s.hl ? { borderColor: '#2DD4BF' } : {}}><span className="stat-icon">{s.icon}</span><span className="stat-value" style={s.hl ? { color: '#2DD4BF' } : {}}>{s.value}</span><span className="stat-label">{s.label}</span></div>
                ))}
              </div>
              <div className="dash-section" style={{ marginBottom: '1rem' }}><div className="progress-bar-wrap"><div className="progress-bar"><div className="progress-fill" style={{ width: `${stats.cleanRate}%` }} /></div><span className="progress-label">{stats.cleanRate}%</span></div></div>
              <div className="dash-section">
                <div className="section-header"><h3>{t('diary.allEntries')}</h3></div>
                {historyLoading ? <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '1rem' }}>{t('common.loading')}</p> :
                 historyError ? <div style={{ textAlign: 'center', padding: '1.5rem' }}><p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}>{t('diary.loadError')}</p><button type="button" className="btn-primary" onClick={() => fetchHistory(userId)}>{t('common.retry')}</button></div> :
                 historyEntries.length === 0 ? <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '1.5rem' }}>{t('diary.noEntriesHistory')}</p> :
                 <div className="entries-list">{(showAllHistory ? historyEntries : historyEntries.slice(0, 7)).map((e, i) => (
                   <div className="entry-item" key={i} style={{ animation: `fadeIn 0.3s ease-out ${i * 0.05}s both` }}>
                     <div className="entry-top"><span className="entry-date">{new Date(e.date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className={`entry-status ${e.gambled ? 'gambled' : 'clean'}`}>{e.gambled ? t('diary.gambledStatus') : t('diary.cleanStatus')}</span></div>
                     <div className="entry-mood">{(e.mood || '').trim() ? t(`diary.mood.${(e.mood || '').trim()}`) === `diary.mood.${(e.mood || '').trim()}` ? (e.mood || '').trim() : t(`diary.mood.${(e.mood || '').trim()}`) : t('diary.noMood')}</div>
                     {e.notes && <p className="entry-note">{e.notes}</p>}
                   </div>
                 ))}</div>}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes checkmarkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes confettiFall { 0%{transform:translateY(-100%) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default Diary
