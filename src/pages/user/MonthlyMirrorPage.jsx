import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

// ✅ Constants
const MAX_RECORDING_DURATION = 300 // 5 minutes
const MAX_STORAGE_SIZE = 50 * 1024 * 1024 // 50MB limit for localStorage fallback
const UPLOAD_RETRY_MAX = 3
const MILESTONE_DISPLAY_DURATION = 8000

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1d5c38;color:#6ee7b7;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid #3b7a5a;white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function MonthlyMirrorPage() {
  const navigate = useNavigate()
  const [identity, setIdentity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [syncedRecordings, setSyncedRecordings] = useState([])
  const [pendingRecordings, setPendingRecordings] = useState([])
  const [recording, setRecording] = useState(false)
  const [recorded, setRecorded] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [milestone, setMilestone] = useState(null)
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [totalRecordings, setTotalRecordings] = useState(0)
  const [firstRecordingDate, setFirstRecordingDate] = useState(null)
  const [recordingsPerMonth, setRecordingsPerMonth] = useState([])
  const [currentPrompt, setCurrentPrompt] = useState(0)
  const [userRole, setUserRole] = useState('user')
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewBlob, setReviewBlob] = useState(null)
  const [syncStatus, setSyncStatus] = useState({})
  const [retryCount, setRetryCount] = useState({})

  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const milestoneTimerRef = useRef(null)
  const reviewVideoRef = useRef(null)
  const syncInProgressRef = useRef(false)
  const mountedRef = useRef(true)

  const currentMonthKey = new Date().toISOString().substring(0, 7)
  const isCurrentMonth = activeMonth === currentMonthKey

  const prompts = [
    { q: 'What has changed this month?', hint: 'Think about your habits, thoughts, and feelings.', example: 'Example: "This month I noticed I get urges mostly on weekends when I\'m bored. I started going for walks instead."' },
    { q: 'What are you most proud of?', hint: 'Even small wins count. Celebrate them.', example: 'Example: "I\'m proud that I logged my diary every day this week. I also said no to betting twice when friends asked."' },
    { q: 'What was the hardest moment?', hint: 'Be honest. Growth comes from facing challenges.', example: 'Example: "The hardest moment was payday. I had KES 5,000 in M-Pesa and almost placed a bet. I called my sister instead."' },
    { q: 'What do you want next month to look like?', hint: 'Set an intention. What will you focus on?', example: 'Example: "Next month I want to save KES 3,000 instead of betting. I\'ll delete the betting app and track my savings."' },
  ]

  const milestones = [
    { type: '1', emoji: '🎬', text: 'Your journey starts here. You recorded your first reflection.' },
    { type: '3', emoji: '🌟', text: '3 months of showing up for yourself.' },
    { type: '6', emoji: '💪', text: 'Half a year of growth.' },
    { type: '12', emoji: '🏆', text: 'A full year. You\'ve built something rare.' },
  ]

  // ✅ Cleanup all resources
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    initPage()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  useEffect(() => {
    if (identity && !syncInProgressRef.current) {
      loadAllRecordings()
    }
  }, [identity, activeMonth])

  const initPage = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setIdentity({ uid: session.user.id })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    setUserRole(profile?.role || 'user')
    await loadAllRecordings()
    setLoading(false)
  }

  const loadAllRecordings = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id

    try {
      // ✅ Fetch only current month's recordings
      const { data: allData, count } = await supabase
        .from('mirror_recordings')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })

      const thisMonth = (allData || []).filter(r => r.month === activeMonth)

      // Pending from localStorage
      const localKey = `mirror_fallback_${activeMonth}`
      let localData = []
      try {
        const stored = localStorage.getItem(localKey)
        if (stored) localData = JSON.parse(stored)
      } catch (err) { /* corrupted data, ignore */ }

      const pending = localData.map((item, i) => ({
        id: `local_${activeMonth}_${i}`,
        month: activeMonth,
        storage_path: 'pending',
        type: item.type || 'video',
        duration_seconds: item.duration || 0,
        created_at: item.date,
        prompt: 'Pending sync',
        _pending: true,
        _localUrl: item.url,
        _localIndex: i,
      }))

      if (mountedRef.current) {
        setPendingRecordings(pending)
        setSyncedRecordings(thisMonth)
        setTotalRecordings(count || (allData || []).length)
        if ((allData || []).length > 0) setFirstRecordingDate(allData[allData.length - 1].created_at)
      }

      // Per month stats
      const perMonth = {}
      ;(allData || []).forEach(r => { perMonth[r.month] = (perMonth[r.month] || 0) + 1 })
      setRecordingsPerMonth(Object.entries(perMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6))

      // Milestones
      const total = count || (allData || []).length
      let hit = null
      if (total === 1) hit = milestones[0]
      else if (total === 3) hit = milestones[1]
      else if (total === 6) hit = milestones[2]
      else if (total >= 12) hit = milestones[3]
      if (hit && mountedRef.current) {
        setMilestone(hit)
        if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current)
        milestoneTimerRef.current = setTimeout(() => { if (mountedRef.current) setMilestone(null) }, MILESTONE_DISPLAY_DURATION)
      }

      // ✅ Auto-sync pending — but only once, with guard
      if (localData.length > 0 && !syncInProgressRef.current) {
        syncInProgressRef.current = true
        await autoSyncPending(localData, localKey)
        syncInProgressRef.current = false
      }
    } catch (err) { console.error('Load recordings error:', err) }
  }

  // ✅ Fixed autoSyncPending — no infinite loop
  const autoSyncPending = async (localData, localKey) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !localData || localData.length === 0) return

    let changed = false
    for (let i = localData.length - 1; i >= 0; i--) {
      const item = localData[i]
      try {
        // Skip if URL is too large for fetch
        if (item.url && item.url.length > MAX_STORAGE_SIZE) {
          setSyncStatus(prev => ({ ...prev, [i]: 'Too large to sync' }))
          continue
        }

        let retries = 0
        let success = false
        while (retries < UPLOAD_RETRY_MAX && !success) {
          try {
            const blob = await (await fetch(item.url)).blob()
            const fileName = `${session.user.id}/${activeMonth}/${Date.now()}.webm`
            const { error } = await supabase.storage.from('mirror-recordings').upload(fileName, blob)
            if (!error) {
              await supabase.from('mirror_recordings').insert({
                user_id: session.user.id, month: activeMonth, storage_path: fileName,
                type: 'video', duration_seconds: item.duration || 0, prompt: prompts[currentPrompt]?.q || 'Reflection',
              })
              success = true
            }
            retries++
          } catch (err) { retries++; if (retries >= UPLOAD_RETRY_MAX) throw err }
        }

        if (success) {
          localData.splice(i, 1)
          changed = true
          setSyncStatus(prev => ({ ...prev, [i]: 'Synced ✅' }))
        }
      } catch (err) {
        setSyncStatus(prev => ({ ...prev, [i]: `Failed: ${err.message || 'Unknown error'}` }))
        setRetryCount(prev => ({ ...prev, [i]: (prev[i] || 0) + 1 }))
      }
    }

    if (changed) {
      if (localData.length === 0) localStorage.removeItem(localKey)
      else {
        try { localStorage.setItem(localKey, JSON.stringify(localData)) } catch (err) { /* storage full */ }
      }
      if (mountedRef.current) loadAllRecordings()
    }
  }

  // ✅ Guard against double-start
  const startRecording = async () => {
    if (streamRef.current || mediaRecorderRef.current?.state === 'recording') {
      showToast('Already recording')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; await videoRef.current.play() }

      // ✅ Feature-detect mime type
      const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => handleRecordingStop()
      mediaRecorder.onerror = () => { showToast('Recording error. Please try again.'); stopRecording(); cleanup() }

      mediaRecorder.start(1000) // collect data every second
      setRecording(true)
      setRecordingTime(0)
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_DURATION - 1) {
            stopRecording()
            return MAX_RECORDING_DURATION
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      showToast('⚠️ Camera/Microphone access denied.')
      console.error('Recording start error:', err)
    }
  }

  const handleRecordingStop = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    const blob = new Blob(chunksRef.current, { type: 'video/webm' })

    // ✅ Size check before upload
    if (blob.size > MAX_STORAGE_SIZE) {
      showToast('⚠️ Video too large. Please record a shorter reflection (under 5 minutes).')
      cleanup()
      setRecording(false)
      return
    }

    // ✅ Enter review mode
    setReviewBlob(blob)
    setReviewMode(true)
    setRecording(false)
  }

  // ✅ User confirms save
  const confirmSave = async () => {
    if (!reviewBlob) return
    setReviewMode(false)
    setUploading(true)
    setUploadProgress(0)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }

    const blob = reviewBlob
    const fileName = `${session.user.id}/${activeMonth}/${Date.now()}.webm`
    setReviewBlob(null)

    // ✅ Retry with exponential backoff
    let retries = 0
    let error = null
    while (retries < UPLOAD_RETRY_MAX) {
      try {
        setUploadProgress(Math.round((retries / UPLOAD_RETRY_MAX) * 100))
        const { error: uploadError } = await supabase.storage.from('mirror-recordings').upload(fileName, blob)
        if (!uploadError) {
          await supabase.from('mirror_recordings').insert({
            user_id: session.user.id, month: activeMonth, storage_path: fileName,
            type: 'video', duration_seconds: recordingTime, prompt: prompts[currentPrompt]?.q || 'Reflection',
          })
          showToast('✅ Reflection saved!')
          setUploading(false)
          setRecorded(true)
          setTimeout(() => setRecorded(false), 3000)
          cleanup()
          await loadAllRecordings()
          return
        }
        error = uploadError
        retries++
      } catch (err) { error = err; retries++ }
    }

    // ✅ Fallback to localStorage — but check size first
    if (blob.size < MAX_STORAGE_SIZE) {
      try {
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
          try {
            const key = `mirror_fallback_${activeMonth}`
            const saved = JSON.parse(localStorage.getItem(key) || '[]')
            saved.push({ url: reader.result, type: 'video', duration: recordingTime, date: new Date().toISOString() })
            localStorage.setItem(key, JSON.stringify(saved))
            showToast('⚠️ Saved locally. Will sync later.')
          } catch (err) { showToast('⚠️ Failed to save. Video may be too large.') }
        }
      } catch (err) { showToast('⚠️ Failed to save. Video may be too large.') }
    } else {
      showToast('⚠️ Video too large to save locally. Please try again.')
    }

    setUploading(false)
    cleanup()
    await loadAllRecordings()
  }

  // ✅ User chooses retake
  const handleRetake = () => {
    setReviewMode(false)
    setReviewBlob(null)
    cleanup()
    // Restart
    setTimeout(() => startRecording(), 300)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const handleDelete = async (recordingId, storagePath) => {
    if (!confirm('Delete this recording?')) return
    try {
      if (storagePath && storagePath !== 'pending') {
        await supabase.storage.from('mirror-recordings').remove([storagePath])
      }
      // ✅ Verify ownership before delete
      const { data: { session } } = await supabase.auth.getSession()
      const query = supabase.from('mirror_recordings').delete().eq('id', recordingId)
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        query.eq('user_id', session?.user?.id)
      }
      await query
      loadAllRecordings()
      showToast('Deleted.', 2000)
    } catch (err) { showToast('Delete failed.', 2000) }
  }

  const retryUpload = async (localIndex) => {
    setUploading(true)
    const localKey = `mirror_fallback_${activeMonth}`
    let localData = []
    try { localData = JSON.parse(localStorage.getItem(localKey) || '[]') } catch { localData = [] }
    const item = localData[localIndex]
    if (!item) { setUploading(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    try {
      const blob = await (await fetch(item.url)).blob()
      const fileName = `${session.user.id}/${activeMonth}/${Date.now()}.webm`
      const { error } = await supabase.storage.from('mirror-recordings').upload(fileName, blob)
      if (!error) {
        await supabase.from('mirror_recordings').insert({
          user_id: session.user.id, month: activeMonth, storage_path: fileName,
          type: 'video', duration_seconds: item.duration || 0, prompt: prompts[currentPrompt]?.q || 'Reflection',
        })
        localData.splice(localIndex, 1)
        if (localData.length === 0) localStorage.removeItem(localKey)
        else localStorage.setItem(localKey, JSON.stringify(localData))
        showToast('✅ Synced!')
        loadAllRecordings()
      } else { showToast('Sync failed. Try again.') }
    } catch (err) { showToast('Sync failed. Try again.') }
    setUploading(false)
  }

  const handleDownload = (url, fileName) => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || `precious-reflection-${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const getPublicUrl = (path) => {
    if (!path || path === 'pending') return ''
    try {
      const { data } = supabase.storage.from('mirror-recordings').getPublicUrl(path)
      return data?.publicUrl || ''
    } catch { return '' }
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const navigateMonth = (dir) => {
    const [y, m] = activeMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const newMonth = d.toISOString().substring(0, 7)
    if (newMonth > currentMonthKey) return
    setActiveMonth(newMonth)
  }

  const monthLabel = new Date(activeMonth + '-01').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
  const sparkMax = Math.max(...recordingsPerMonth.map(([, v]) => v), 1)
  const canDeleteSynced = userRole === 'admin' || userRole === 'super_admin'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
    </div>
  )

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0, overflowX: 'hidden' }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#041f13', borderBottom: '1px solid #0a3d22', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', fontFamily: "'Inter', sans-serif", margin: 0 }}>🪞 Monthly Mirror</h1>
            <p style={{ fontSize: '11px', color: '#3b7a5a', margin: '2px 0 0' }}>{syncedRecordings.length + pendingRecordings.length} recordings</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => navigateMonth(-1)} style={{ background: 'transparent', border: '1px solid #0a3d22', color: '#6ee7b7', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', minWidth: '36px' }} aria-label="Previous month">←</button>
            <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 500, minWidth: '90px', textAlign: 'center' }}>{monthLabel}</span>
            <button onClick={() => navigateMonth(1)} disabled={isCurrentMonth} style={{ background: 'transparent', border: '1px solid #0a3d22', color: isCurrentMonth ? '#1d5c38' : '#6ee7b7', padding: '6px 10px', borderRadius: '6px', cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: '14px', minWidth: '36px', opacity: isCurrentMonth ? 0.4 : 1 }} aria-label="Next month">→</button>
          </div>
        </nav>

        {/* Milestone Banner */}
        {milestone && (
          <div style={{ background: '#0a3d22', border: '1px solid #3db88a', padding: '10px 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#6ee7b7', fontSize: '12px' }}>{milestone.emoji} {milestone.text}</span>
            <button onClick={() => { setMilestone(null); if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current) }} style={{ background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '16px', cursor: 'pointer', padding: '4px 8px' }} aria-label="Dismiss milestone">✕</button>
          </div>
        )}

        <div style={{ padding: '1rem', maxWidth: '650px', margin: '0 auto' }}>

          {/* Review Mode */}
          {reviewMode && reviewBlob && (
            <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: '#f59e0b', textAlign: 'center' }}>
              <h3 style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '0.75rem' }}>👀 Review Your Recording</h3>
              <div style={{ background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <video ref={reviewVideoRef} src={URL.createObjectURL(reviewBlob)} controls style={{ width: '100%', maxHeight: '300px' }} />
              </div>
              <p style={{ color: '#3b7a5a', fontSize: '12px', marginBottom: '0.75rem' }}>Duration: {formatTime(recordingTime)}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRetake} className="btn-ghost" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>🔄 Retake</button>
                <button onClick={confirmSave} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>💾 Save</button>
              </div>
            </div>
          )}

          {/* Uploading Progress */}
          {uploading && (
            <div className="dash-section" style={{ marginBottom: '0.75rem', textAlign: 'center' }}>
              <p style={{ color: '#FAC775', fontSize: '13px', marginBottom: '8px' }}>⏳ Uploading your reflection...</p>
              <div style={{ height: '4px', background: '#0a3d22', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {/* Prompts */}
          <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
            <p style={{ color: '#f59e0b', fontSize: '11px', marginBottom: '10px', letterSpacing: '0.05em', fontWeight: 600 }}>💬 CHOOSE YOUR REFLECTION PROMPT</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {prompts.map((p, i) => (
                <button key={i} onClick={() => setCurrentPrompt(i)} role="radio" aria-checked={currentPrompt === i}
                  style={{ background: currentPrompt === i ? 'rgba(245,158,11,0.08)' : '#041f13', border: `1px solid ${currentPrompt === i ? '#f59e0b' : '#0a3d22'}`, borderRadius: '10px', padding: currentPrompt === i ? '14px' : '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: currentPrompt === i ? 600 : 400 }}>{p.q}</span>
                      <p style={{ color: '#3b7a5a', fontSize: '11px', margin: '4px 0 0', lineHeight: '1.4' }}>{p.hint}</p>
                    </div>
                    {currentPrompt === i && <span style={{ color: '#f59e0b', fontSize: '9px', fontWeight: 600, background: '#0a3d22', padding: '2px 8px', borderRadius: '100px', flexShrink: 0 }}>SELECTED</span>}
                  </div>
                  {currentPrompt === i && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', background: '#062616', borderRadius: '8px', border: '1px dashed #1d5c38' }}>
                      <p style={{ color: '#3b7a5a', fontSize: '10px', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 Example</p>
                      <p style={{ color: '#6ee7b7', fontSize: '11px', lineHeight: '1.5', fontStyle: 'italic', margin: 0 }}>{p.example}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Record Section */}
          <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: (syncedRecordings.length + pendingRecordings.length) > 0 ? '#0a3d22' : '#f59e0b' }}>
            <h3 style={{ color: (syncedRecordings.length + pendingRecordings.length) > 0 ? '#3b7a5a' : '#f59e0b', fontSize: '13px', marginBottom: '0.75rem' }}>
              {(syncedRecordings.length + pendingRecordings.length) > 0 ? '+ Add another reflection' : `🎥 Record your ${monthLabel} reflection`}
            </h3>

            {!recording && !reviewMode && !uploading && (
              <>
                {(syncedRecordings.length + pendingRecordings.length) === 0 && (
                  <div style={{ background: '#000', borderRadius: '10px', minHeight: '180px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ fontSize: '40px' }}>🎥</span>
                    <p style={{ color: '#6ee7b7', fontSize: '12px', marginTop: '6px' }}>Camera preview will appear here</p>
                    <p style={{ color: '#3b7a5a', fontSize: '10px', marginTop: '4px' }}>Record up to {Math.floor(MAX_RECORDING_DURATION / 60)} minutes</p>
                  </div>
                )}
                <button className="btn-primary full" onClick={startRecording} disabled={uploading} style={{ fontSize: '13px', padding: '10px' }}>
                  {(syncedRecordings.length + pendingRecordings.length) > 0 ? '🎥 Record another video' : '🎥 Record video'}
                </button>
              </>
            )}

            {recording && (
              <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                <div style={{ background: '#000', borderRadius: '10px', overflow: 'hidden', minHeight: '200px', position: 'relative' }}>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F09595', animation: 'pulse 1s infinite' }} aria-hidden="true" />
                  <span style={{ color: '#F09595', fontSize: '11px', fontWeight: 600 }} aria-label="Recording in progress">Recording...</span>
                </div>
                <span style={{ position: 'absolute', top: '8px', right: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '4px' }}>{formatTime(recordingTime)} / {formatTime(MAX_RECORDING_DURATION)}</span>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button className="btn-primary" style={{ flex: 1, fontSize: '12px', padding: '10px' }} onClick={stopRecording}>⏹ Stop</button>
                  <button className="btn-ghost" style={{ flex: 1, fontSize: '12px', padding: '10px' }} onClick={() => { stopRecording(); cleanup(); setRecording(false); setReviewBlob(null) }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Pending Recordings */}
          {pendingRecordings.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: '#FAC775' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ color: '#FAC775', fontSize: '12px', margin: 0 }}>⏳ Pending sync ({pendingRecordings.length})</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendingRecordings.map(r => (
                  <div key={r.id} style={{ background: '#041f13', border: '1px solid #FAC775', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}>
                      <div style={{ width: '64px', height: '44px', borderRadius: '4px', background: '#000', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => setExpandedPlayer(expandedPlayer === r.id ? null : r.id)}>
                        <span style={{ fontSize: '20px' }}>⏳</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#e2f5ec', fontSize: '11px', fontWeight: 500, margin: 0 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        <p style={{ color: '#FAC775', fontSize: '10px', margin: '2px 0' }}>
                          ⏳ {syncStatus[r._localIndex] || 'Waiting to sync'} · {formatTime(r.duration_seconds)}
                        </p>
                      </div>
                      <button onClick={() => retryUpload(r._localIndex)} disabled={uploading}
                        style={{ padding: '8px 14px', borderRadius: '100px', background: '#FAC775', border: 'none', color: '#041f13', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minWidth: '60px', minHeight: '44px' }}>
                        {uploading ? '...' : 'Sync'}
                      </button>
                    </div>
                    {expandedPlayer === r.id && (
                      <div style={{ borderTop: '1px solid #FAC775', background: '#000' }}>
                        <video controls style={{ width: '100%', display: 'block', maxHeight: '250px' }} src={r._localUrl} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Synced Recordings */}
          {syncedRecordings.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ color: '#e2f5ec', fontSize: '12px', marginBottom: '0.75rem' }}>📼 Your recordings ({syncedRecordings.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {syncedRecordings.map(r => (
                  <div key={r.id} style={{ background: '#041f13', border: '1px solid #0a3d22', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}>
                      <div style={{ width: '64px', height: '44px', borderRadius: '4px', background: '#000', flexShrink: 0, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setExpandedPlayer(expandedPlayer === r.id ? null : r.id)}>
                        <video src={getPublicUrl(r.storage_path)} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} preload="metadata" muted playsInline />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                          <span style={{ fontSize: '16px' }}>▶</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#e2f5ec', fontSize: '11px', fontWeight: 500, margin: 0 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ color: '#3db88a', fontSize: '9px', background: '#0a3d22', padding: '1px 6px', borderRadius: '100px' }}>✓ Synced</span>
                          <span style={{ color: '#3b7a5a', fontSize: '10px' }}>{formatTime(r.duration_seconds)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                        <button onClick={() => setExpandedPlayer(expandedPlayer === r.id ? null : r.id)} style={{ background: expandedPlayer === r.id ? '#0a3d22' : 'transparent', border: '1px solid #0a3d22', color: '#6ee7b7', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label={expandedPlayer === r.id ? 'Collapse video' : 'Expand video'}>{expandedPlayer === r.id ? '▼' : '▶'}</button>
                        <button onClick={() => handleDownload(getPublicUrl(r.storage_path), `precious-${activeMonth}-reflection.webm`)} style={{ background: 'transparent', border: '1px solid #0a3d22', color: '#6ee7b7', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Download" aria-label="Download recording">⬇</button>
                        <button onClick={() => handleDelete(r.id, r.storage_path)} style={{ background: 'transparent', border: '1px solid #3a1010', color: '#F09595', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete" aria-label="Delete recording">🗑</button>
                      </div>
                    </div>
                    {expandedPlayer === r.id && (
                      <div style={{ borderTop: '1px solid #0a3d22', background: '#000' }}>
                        <video controls autoPlay style={{ width: '100%', display: 'block', maxHeight: '300px' }} src={getPublicUrl(r.storage_path)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="dash-section">
            <h3 style={{ color: '#e2f5ec', fontSize: '12px', marginBottom: '0.5rem' }}>🎬 Your journey</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: recordingsPerMonth.length > 0 ? '10px' : '0' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#041f13', border: '2px solid #3db88a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#3db88a', fontSize: '18px', fontWeight: 700 }}>{totalRecordings}</span>
                <span style={{ color: '#3b7a5a', fontSize: '8px' }}>videos</span>
              </div>
              <div>
                <p style={{ color: '#9fe1cb', fontSize: '11px', margin: 0 }}>
                  {totalRecordings === 0 ? 'No recordings yet. Start today!' : totalRecordings === 1 ? 'Your journey starts here.' : `You've recorded ${totalRecordings} reflections.`}
                </p>
                {firstRecordingDate && <p style={{ color: '#3b7a5a', fontSize: '10px', margin: '3px 0 0' }}>Since {new Date(firstRecordingDate).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</p>}
              </div>
            </div>
            {recordingsPerMonth.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '30px' }}>
                  {recordingsPerMonth.map(([month, count]) => (
                    <div key={month} style={{ flex: 1, height: `${(count/sparkMax)*26+4}px`, background: month === activeMonth ? '#f59e0b' : '#3db88a', borderRadius: '2px 2px 0 0', opacity: 0.8 }} title={`${count} recording${count !== 1 ? 's' : ''}`} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                  {recordingsPerMonth.map(([month]) => (
                    <div key={month} style={{ flex: 1, textAlign: 'center', color: '#1d5c38', fontSize: '8px' }}>
                      {new Date(month+'-01').toLocaleDateString('en-KE',{month:'short'}).substring(0,3)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p style={{ color: '#1d5c38', fontSize: '10px', textAlign: 'center', fontStyle: 'italic', padding: '0.75rem 0 0' }}>
            🪞 The mirror doesn't judge — it just shows how far you've come.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
