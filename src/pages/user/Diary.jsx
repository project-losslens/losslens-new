import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState(null)
  const [todayEntry, setTodayEntry] = useState(null)
  const [gambled, setGambled] = useState(null)
  const [mood, setMood] = useState('')
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
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [activeView, setActiveView] = useState('today')
  const [stats, setStats] = useState({ totalEntries: 0, cleanDays: 0, gambleDays: 0, cleanRate: 0, topTriggers: [], topCoping: [] })

  const moods = [' Calm', ' Stressed', ' Anxious', ' Depressed', ' Happy']
  const triggerOptions = ['Boredom', 'Stress', 'Social Pressure', 'Financial Pressure', 'Celebration', 'Ads/Promotions', 'Other']
  const copingOptions = ['Breathing', 'Left Situation', 'Called Someone', 'App Tools', 'Exercise', 'Other']
  const gamblingTypes = ['Sports Betting', 'Casino', 'Lottery', 'Online', 'Other']

  useEffect(() => {
    fetchSession()
    checkVoiceSupport()
    return () => stopListening()
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
      setMood(data.mood || '')
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
    const { data } = await supabase.from('diary_entries').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(30)
    const entries = data || []
    setHistoryEntries(entries)
    const total = entries.length
    const clean = entries.filter(e => !e.gambled).length
    const gamble = entries.filter(e => e.gambled).length
    const rate = total > 0 ? Math.round((clean / total) * 100) : 0
    const tc = {}; entries.forEach(e => { (e.triggers || []).forEach(t => tc[t] = (tc[t] || 0) + 1) })
    const cc = {}; entries.forEach(e => { (e.coping || []).forEach(c => cc[c] = (cc[c] || 0) + 1) })
    setStats({ totalEntries: total, cleanDays: clean, gambleDays: gamble, cleanRate: rate, topTriggers: Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 5), topCoping: Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 5) })
    setHistoryLoading(false)
  }

  const toggleItem = (item, list, setList) => {
    if (list.includes(item)) setList(list.filter(i => i !== item))
    else setList([...list, item])
  }

  const handleSave = async () => {
    setSaveError('')
    if (gambled === null) { showToast('Please select if you gambled today', 2000); return }
    if (!userId) { showToast('Please log in again', 2000); return }

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
      mood: mood || null,
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
      setSaveError(error.message || 'Failed to save. Please try again.')
      setLoading(false)
      showToast(' Failed to save. Try again.', 3000)
      return
    }

    // Recompute streak/money/badges server-side (privileged fields).
    let recomputed = null
    try {
      const { recomputeProgress, checkBadges } = await import('../../lib/gamification')
      recomputed = await recomputeProgress()
      if (recomputed?.freeze_activated) {
        showToast(' Streak freeze activated! Your streak is safe.', 4000)
      }
      const earnedBadges = await checkBadges(userId) || []
      if (earnedBadges.length > 0) {
        triggerConfetti()
        earnedBadges.forEach(b => showToast(`${b.emoji} ${b.name} badge earned!`, 4000))
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

    if (!gambled && !error) { triggerConfetti(); showToast(' Clean day logged! Keep going!', 3000) }
    else showToast(' Entry saved. Tomorrow is a new day.', 3000)

    setTimeout(() => { setSaved(false); setShowCheckmark(false) }, 2000)
  }

  // Profile progress fields are recomputed server-side via recompute_progress().

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Today's Diary</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <button onClick={() => setActiveView('today')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeView === 'today' ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeView === 'today' ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: activeView === 'today' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Today's Entry</button>
            <button onClick={() => setActiveView('history')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeView === 'history' ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeView === 'history' ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: activeView === 'history' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> History {stats.totalEntries > 0 ? `(${stats.totalEntries})` : ''}</button>
          </div>

          {activeView === 'today' && (
            <>
              {showCheckmark && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '3px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'checkmarkPop 0.5s ease-out' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <p style={{ color: '#2DD4BF', fontSize: '14px', marginTop: '12px', fontWeight: 500 }}>{gambled ? 'Entry saved ' : 'Great job staying clean! '}</p>
                </div>
              )}

              {saveError && (
                <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>
                  {saveError}
                </div>
              )}

              <div className="dash-section">
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>Did you gamble today?</h3>
                <div className="toggle-group">
                  <button className={`toggle-btn ${gambled === false ? 'active-primary' : ''}`} onClick={() => { setGambled(false); showToast(' Clean day — proud of you!', 1500) }}>No </button>
                  <button className={`toggle-btn ${gambled === true ? 'active-alert' : ''}`} onClick={() => setGambled(true)}>Yes</button>
                </div>
              </div>

              {gambled && (
                <div className="dash-section" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>Gambling details</h3>
                  <div className="form-group"><label>Type</label><div className="chip-group">{gamblingTypes.map(t => <button key={t} className={`chip ${gamblingType === t ? 'chip-active' : ''}`} onClick={() => setGamblingType(t)}>{t}</button>)}</div></div>
                  <div className="form-row">
                    <div className="form-group"><label>Time (hrs)</label><input type="number" placeholder="2" value={timeSpent} onChange={e => setTimeSpent(e.target.value)} /></div>
                    <div className="form-group"><label>Spent (KSh)</label><input type="number" placeholder="500" value={moneySpent} onChange={e => setMoneySpent(e.target.value)} /></div>
                    <div className="form-group"><label>Won (KSh)</label><input type="number" placeholder="0" value={moneyWon} onChange={e => setMoneyWon(e.target.value)} /></div>
                  </div>
                </div>
              )}

              <div className="dash-section"><h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>How are you feeling?</h3><div className="chip-group">{moods.map(m => <button key={m} className={`chip ${mood === m ? 'chip-active' : ''}`} onClick={() => setMood(m)}>{m}</button>)}</div></div>
              <div className="dash-section"><h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>Triggers</h3><div className="chip-group">{triggerOptions.map(t => <button key={t} className={`chip ${triggers.includes(t) ? 'chip-active' : ''}`} onClick={() => toggleItem(t, triggers, setTriggers)}>{t}</button>)}</div></div>
              <div className="dash-section"><h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>Coping strategies</h3><div className="chip-group">{copingOptions.map(c => <button key={c} className={`chip ${coping.includes(c) ? 'chip-active' : ''}`} onClick={() => toggleItem(c, coping, setCoping)}>{c}</button>)}</div></div>

              <div className="dash-section">
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}>Notes</h3>
                {voiceSupported && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px 12px', background: isListening ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)', borderRadius: '8px', border: `1px solid ${isListening ? '#FFFFFF' : '#7DBDEE'}` }}>
                    <button onClick={() => isListening ? stopListening() : startListening()} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: isListening ? '#FFFFFF' : '#2DD4BF', color: '#0B1220', fontSize: '16px', cursor: 'pointer', animation: isListening ? 'pulse 1.5s infinite' : 'none' }}></button>
                    <span style={{ flex: 1, fontSize: '12px', color: isListening ? '#FFFFFF' : '#2DD4BF' }}>{isListening ? ' Listening...' : 'Tap to speak'}</span>
                    {isListening && <button onClick={stopListening} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '18px', cursor: 'pointer' }}>⏹</button>}
                  </div>
                )}
                <textarea className="diary-textarea" placeholder="How did today feel?" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
              </div>

              <button className="btn-primary full" onClick={handleSave} disabled={loading || saved || gambled === null}>
                {loading ? <span className="spinner"></span> : saved ? ' Saved!' : todayEntry ? 'Update entry' : 'Save entry'}
              </button>
            </>
          )}

          {activeView === 'history' && (
            <>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                {[{ icon: '', value: stats.totalEntries, label: 'Total' }, { icon: '', value: `${stats.cleanRate}%`, label: 'Clean rate', hl: stats.cleanRate >= 70 }, { icon: '', value: stats.cleanDays, label: 'Clean days' }, { icon: '', value: stats.gambleDays, label: 'Gamble days' }].map((s, i) => (
                  <div className="stat-card" key={i} style={s.hl ? { borderColor: '#2DD4BF' } : {}}><span className="stat-icon">{s.icon}</span><span className="stat-value" style={s.hl ? { color: '#2DD4BF' } : {}}>{s.value}</span><span className="stat-label">{s.label}</span></div>
                ))}
              </div>
              <div className="dash-section" style={{ marginBottom: '1rem' }}><div className="progress-bar-wrap"><div className="progress-bar"><div className="progress-fill" style={{ width: `${stats.cleanRate}%` }} /></div><span className="progress-label">{stats.cleanRate}%</span></div></div>
              <div className="dash-section">
                <div className="section-header"><h3>All entries</h3></div>
                {historyLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>Loading...</p> :
                 historyEntries.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1.5rem' }}>No entries yet.</p> :
                 <div className="entries-list">{(showAllHistory ? historyEntries : historyEntries.slice(0, 7)).map((e, i) => (
                   <div className="entry-item" key={i} style={{ animation: `fadeIn 0.3s ease-out ${i * 0.05}s both` }}>
                     <div className="entry-top"><span className="entry-date">{new Date(e.date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className={`entry-status ${e.gambled ? 'gambled' : 'clean'}`}>{e.gambled ? 'Gambled' : 'Clean'}</span></div>
                     <div className="entry-mood">{e.mood || 'No mood'}</div>
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
