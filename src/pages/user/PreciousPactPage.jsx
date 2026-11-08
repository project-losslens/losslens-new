import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { readAndMigrateStorageItem } from '../../lib/storage'

//  Constants
const MAX_RECORDING_DURATION = 600 // 10 minutes
const MAX_WRITTEN_LENGTH = 2000
const STORAGE_PATH_PENDING = 'pending'
const STORAGE_PATH_WRITTEN = 'written'

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function LossLensPactPage() {
  const navigate = useNavigate()
  const [identity, setIdentity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pacts, setPacts] = useState([])
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [activePrompt, setActivePrompt] = useState(0)
  const [pactTitle, setPactTitle] = useState('')
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [writtenPact, setWrittenPact] = useState('')
  const [showWritten, setShowWritten] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [totalPacts, setTotalPacts] = useState(0)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewBlob, setReviewBlob] = useState(null)

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  const reviewAudioRef = useRef(null)

  const prompts = [
    { q: 'Why are you doing this?', hint: 'Think about your family, your future, your peace.' },
    { q: 'Who are you doing this for?', hint: 'Name them. Picture their faces.' },
    { q: 'What will life look like in 6 months?', hint: 'Describe your best self. What has changed?' },
    { q: 'What would you tell your struggling self?', hint: 'When the urge hits, what words of strength do you need?' },
  ]

  //  Cleanup all resources
  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    initPage()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  //  Fetch pacts only when identity is set — no double fetch
  useEffect(() => {
    if (identity) fetchPacts()
  }, [identity])

  const initPage = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setIdentity({ uid: session.user.id })
    // Don't call fetchPacts here — useEffect will handle it
    setLoading(false)
  }

  const fetchPacts = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id

    try {
      const { data } = await supabase.from('precious_pacts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(30)
      const syncedPacts = (data || []).map(p => ({ ...p, _synced: true }))

      //  User-specific localStorage key
      const localKey = `losslens_pacts_${uid}`
      const legacyKey = `precious_pacts_${uid}`
      let localPacts = []
      try {
        const stored = readAndMigrateStorageItem(localKey, legacyKey)
        if (stored) localPacts = JSON.parse(stored)
      } catch { localPacts = [] }

      const pendingPacts = localPacts.map((p, i) => ({
        id: `local_${i}`,
        storage_path: STORAGE_PATH_PENDING,
        title: p.title || 'Untitled',
        duration_seconds: p.duration || 0,
        created_at: p.date,
        prompt: p.prompt,
        _pending: true,
        _localUrl: p.url,
        _localIndex: i,
      }))

      if (mountedRef.current) {
        setPacts([...pendingPacts, ...syncedPacts])
        setTotalPacts(syncedPacts.length)
      }
    } catch (err) { console.error('Fetch pacts error:', err) }
  }

  //  Guard against double-click
  const startRecording = async () => {
    if (recording || streamRef.current || mediaRecorderRef.current?.state === 'recording') {
      showToast('Already recording')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => handleRecordingStop()
      mediaRecorder.onerror = () => { showToast('Recording error.'); stopRecording(); cleanup() }

      mediaRecorder.start(1000)
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
      showToast('⚠️ Microphone access denied.')
      console.error('Recording start error:', err)
    }
  }

  const handleRecordingStop = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

    //  Enter review mode
    setReviewBlob(blob)
    setReviewMode(true)
    setRecording(false)
  }

  //  User confirms save
  const confirmSave = async () => {
    if (!reviewBlob) return
    setReviewMode(false)
    setUploading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }

    const blob = reviewBlob
    const fileName = `${session.user.id}/${Date.now()}.webm`
    setReviewBlob(null)

    try {
      const { error } = await supabase.storage.from('precious-pacts').upload(fileName, blob)
      if (!error) {
        await supabase.from('precious_pacts').insert({
          user_id: session.user.id,
          storage_path: fileName,
          title: pactTitle || `Pact ${new Date().toLocaleDateString('en-KE')}`,
          duration_seconds: recordingTime,
          prompt: prompts[activePrompt].q,
        })
        showToast(' Pact saved!')
      } else {
        throw error
      }
    } catch (err) {
      //  Fallback to localStorage
      try {
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
          const localKey = `losslens_pacts_${session.user.id}`
          const legacyKey = `precious_pacts_${session.user.id}`
          const localPacts = JSON.parse(readAndMigrateStorageItem(localKey, legacyKey) || '[]')
          localPacts.push({
            url: reader.result,
            title: pactTitle || `Pact ${new Date().toLocaleDateString('en-KE')}`,
            duration: recordingTime,
            prompt: prompts[activePrompt].q,
            date: new Date().toISOString(),
          })
          try { localStorage.setItem(localKey, JSON.stringify(localPacts)) } catch {}
          showToast('⚠️ Saved locally.')
        }
      } catch {}
    }

    setUploading(false)
    cleanup()
    setPactTitle('')
    await fetchPacts()
  }

  //  Retake
  const handleRetake = () => {
    setReviewMode(false)
    setReviewBlob(null)
    cleanup()
    setTimeout(() => startRecording(), 300)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const handleDelete = async (pactId, storagePath, isLocal, localIndex) => {
    if (isLocal) {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id || 'unknown'
      const localKey = `losslens_pacts_${userId}`
      const legacyKey = `precious_pacts_${userId}`
      const localPacts = JSON.parse(readAndMigrateStorageItem(localKey, legacyKey) || '[]')
      localPacts.splice(localIndex, 1)
      if (localPacts.length === 0) localStorage.removeItem(localKey)
      else localStorage.setItem(localKey, JSON.stringify(localPacts))
    } else {
      //  Verify ownership
      const { data: { session } } = await supabase.auth.getSession()
      if (storagePath && storagePath !== STORAGE_PATH_PENDING) {
        await supabase.storage.from('precious-pacts').remove([storagePath])
      }
      const query = supabase.from('precious_pacts').delete().eq('id', pactId)
      if (session?.user?.id) query.eq('user_id', session.user.id)
      await query
    }
    setDeleteConfirm(null)
    fetchPacts()
    showToast('Pact deleted.', 2000)
  }

  //  Fixed incrementPlayCount using RPC
  const incrementPlayCount = async (pactId) => {
    if (!pactId || pactId.startsWith('local_')) return
    try {
      await supabase.rpc('increment_pact_play_count', { pact_id: pactId })
      fetchPacts()
    } catch (err) {
      // Fallback: fetch-update-save
      const { data } = await supabase.from('precious_pacts').select('play_count').eq('id', pactId).single()
      if (data) {
        await supabase.from('precious_pacts').update({ play_count: (data.play_count || 0) + 1 }).eq('id', pactId)
        fetchPacts()
      }
    }
  }

  const getPublicUrl = (path) => {
    if (!path || path === STORAGE_PATH_PENDING) return null
    try {
      const { data } = supabase.storage.from('precious-pacts').getPublicUrl(path)
      return data?.publicUrl || null
    } catch { return null }
  }

  const saveWrittenPact = async () => {
    if (!writtenPact.trim() || writtenPact.length > MAX_WRITTEN_LENGTH) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      const { error } = await supabase.from('precious_pacts').insert({
        user_id: session.user.id,
        storage_path: STORAGE_PATH_WRITTEN,
        title: pactTitle || `Written Pact ${new Date().toLocaleDateString('en-KE')}`,
        duration_seconds: 0,
        prompt: writtenPact.substring(0, MAX_WRITTEN_LENGTH),
        play_count: 0,
      })
      if (error) throw error
      showToast(' Written pact saved!')
      setWrittenPact('')
      setPactTitle('')
      setShowWritten(false)
      fetchPacts()
    } catch (err) { showToast('Failed to save. Try again.', 2000) }
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
    </div>
  )

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }} className="page-content">

        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> The LossLens Pact</h1>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{totalPacts} pacts  · A promise to your future self</p>
          </div>
        </div>

        <div style={{ padding: '1rem', maxWidth: '650px', margin: '0 auto' }}>

          {/* Explanation Card */}
          <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: '#2DD4BF' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '28px', flexShrink: 0 }}></span>
              <div>
                <h3 style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '4px' }}>What is the LossLens Pact?</h3>
                <p style={{ color: '#7DBDEE', fontSize: '12px', lineHeight: '1.5', fontWeight: 300, margin: 0 }}>
                  Record a message to your future self when you're feeling strong. When you're struggling, play it back to remember why you started.
                </p>
              </div>
            </div>
          </div>

          {/* Review Mode */}
          {reviewMode && reviewBlob && (
            <div className="dash-section" style={{ marginBottom: '0.75rem', borderColor: '#2DD4BF', textAlign: 'center' }}>
              <h3 style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '0.75rem' }}> Review Your Recording</h3>
              <audio ref={reviewAudioRef} src={URL.createObjectURL(reviewBlob)} controls style={{ width: '100%', marginBottom: '0.75rem' }} />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '0.75rem' }}>Duration: {formatTime(recordingTime)}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRetake} className="btn-ghost" style={{ flex: 1, padding: '10px', fontSize: '13px' }}> Retake</button>
                <button onClick={confirmSave} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}> Save</button>
              </div>
            </div>
          )}

          {uploading && (
            <div style={{ textAlign: 'center', padding: '10px', color: '#7DBDEE', fontSize: '12px', marginBottom: '0.5rem' }}>
              ⏳ Saving your pact...
            </div>
          )}

          {/* Prompts */}
          <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
            <p style={{ color: '#2DD4BF', fontSize: '10px', marginBottom: '8px', letterSpacing: '0.05em', fontWeight: 600 }}> CHOOSE YOUR PROMPT</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {prompts.map((p, i) => (
                <button key={i} onClick={() => setActivePrompt(i)} role="radio" aria-checked={activePrompt === i}
                  style={{ background: activePrompt === i ? 'rgba(45,212,191,0.08)' : '#0B1220', border: `1px solid ${activePrompt === i ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: activePrompt === i ? '#2DD4BF' : '#7DBDEE', fontSize: '12px', fontFamily: 'var(--font-body)' }}>{p.q}</span>
                    {activePrompt === i && <span style={{ color: '#2DD4BF', fontSize: '9px', fontWeight: 600 }}>SELECTED</span>}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', margin: '3px 0 0', lineHeight: '1.3' }}>{p.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title Input */}
          <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
            <label style={{ color: '#2DD4BF', fontSize: '11px', marginBottom: '6px', display: 'block' }}>Give your pact a title (optional)</label>
            <input value={pactTitle} onChange={e => setPactTitle(e.target.value)} placeholder="e.g. My reason to stay strong" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
          </div>

          {/* Record Section */}
          {!reviewMode && !uploading && (
            <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '0.75rem' }}> Record your pact</h3>

              {!recording && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" style={{ flex: 1, padding: '12px', fontSize: '13px' }} onClick={startRecording} aria-label="Start recording audio"> Record audio</button>
                  <button className="btn-ghost" style={{ flex: 1, padding: '12px', fontSize: '13px' }} onClick={() => setShowWritten(!showWritten)} aria-label="Write instead of recording">✍️ Write instead</button>
                </div>
              )}

              {recording && (
                <div>
                  <div style={{ background: '#0B1220', borderRadius: '12px', padding: '2rem', textAlign: 'center', marginBottom: '10px', border: '2px solid #FFFFFF' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 1s infinite' }}>
                      <span style={{ fontSize: '24px' }} aria-hidden="true"></span>
                    </div>
                    <p style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-display)', margin: '0 0 4px' }} aria-label={`Recording time: ${formatTime(recordingTime)}`}>{formatTime(recordingTime)}</p>
                    <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }} aria-label="Recording in progress"> Recording... Speak from the heart.</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3px', height: '40px', marginTop: '16px' }}>
                      {[1,2,3,4,5,6,7,8].map((_, i) => (
                        <div key={i} style={{ width: '5px', background: '#FFFFFF', borderRadius: '3px', animation: `voiceBar 0.4s ${i*0.1}s ease-in-out infinite alternate`, height: `${20 + Math.sin(i * 1.5) * 15}px` }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '12px' }} onClick={stopRecording}>⏹ Stop</button>
                    <button className="btn-ghost" style={{ flex: 1, padding: '10px', fontSize: '12px' }} onClick={() => { stopRecording(); cleanup(); setRecording(false); setReviewBlob(null) }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Written Pact */}
          {showWritten && (
            <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '13px', marginBottom: '0.75rem' }}>✍️ Write your pact</h3>
              <textarea value={writtenPact} onChange={e => setWrittenPact(e.target.value.slice(0, MAX_WRITTEN_LENGTH))} placeholder="Dear future me, when you read this, remember..." rows={5}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', lineHeight: '1.6', boxSizing: 'border-box' }} />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '4px' }}>{writtenPact.length}/{MAX_WRITTEN_LENGTH}</p>
              <button className="btn-primary full" style={{ marginTop: '8px', padding: '10px', fontSize: '12px' }} onClick={saveWrittenPact} disabled={!writtenPact.trim()}>Save written pact </button>
            </div>
          )}

          {/* Pacts List */}
          {pacts.length > 0 && (
            <div className="dash-section">
              <h3 style={{ color: '#FFFFFF', fontSize: '13px', margin: '0 0 0.75rem' }}> Your pacts ({pacts.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pacts.map((pact) => (
                  <div key={pact.id} style={{ background: '#0B1220', border: `1px solid ${pact._pending ? '#7DBDEE' : 'rgba(255,255,255,0.12)'}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: pact._pending ? 'rgba(45,212,191,0.15)' : pact.storage_path === STORAGE_PATH_WRITTEN ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)', border: `2px solid ${pact._pending ? '#7DBDEE' : pact.storage_path === STORAGE_PATH_WRITTEN ? 'rgba(255,255,255,0.4)' : '#2DD4BF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                        {pact.storage_path === STORAGE_PATH_WRITTEN ? '' : pact._pending ? '⏳' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 500, margin: 0 }}>{pact.title || `Pact`}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{new Date(pact.created_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {pact.duration_seconds > 0 && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{formatTime(pact.duration_seconds)}</span>}
                          {pact._pending ? <span style={{ color: '#7DBDEE', fontSize: '9px', background: 'rgba(45,212,191,0.15)', padding: '1px 6px', borderRadius: '100px' }}>⏳ Local</span> : <span style={{ color: '#2DD4BF', fontSize: '9px', background: 'rgba(255,255,255,0.12)', padding: '1px 6px', borderRadius: '100px' }}> Saved</span>}
                          {pact.play_count > 0 && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px' }}>▶ {pact.play_count}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                        {pact.storage_path !== STORAGE_PATH_WRITTEN && (
                          <button onClick={() => setExpandedPlayer(expandedPlayer === pact.id ? null : pact.id)} style={{ background: expandedPlayer === pact.id ? 'rgba(255,255,255,0.12)' : 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            aria-label={expandedPlayer === pact.id ? 'Collapse' : 'Expand'}>{expandedPlayer === pact.id ? '▼' : '▶'}</button>
                        )}
                        {pact.storage_path === STORAGE_PATH_WRITTEN && (
                          <button onClick={() => setExpandedPlayer(expandedPlayer === pact.id ? null : pact.id)} style={{ background: expandedPlayer === pact.id ? 'rgba(255,255,255,0.12)' : 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                            aria-label={expandedPlayer === pact.id ? 'Collapse' : 'Expand'}>{expandedPlayer === pact.id ? '▲' : ''}</button>
                        )}
                        {!pact._pending && pact.storage_path !== STORAGE_PATH_WRITTEN && (
                          <a href={getPublicUrl(pact.storage_path) || '#'} download style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} aria-label="Download">⬇</a>
                        )}
                        <button onClick={() => setDeleteConfirm({ id: pact.id, path: pact.storage_path, isLocal: pact._pending, localIndex: pact._localIndex })} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', width: '32px', height: '32px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }} aria-label="Delete"></button>
                      </div>
                    </div>
                    {expandedPlayer === pact.id && pact.storage_path !== STORAGE_PATH_WRITTEN && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', padding: '12px' }}>
                        <audio controls autoPlay style={{ width: '100%' }} src={pact._pending ? pact._localUrl : getPublicUrl(pact.storage_path)} onPlay={() => incrementPlayCount(pact.id)} />
                      </div>
                    )}
                    {expandedPlayer === pact.id && pact.storage_path === STORAGE_PATH_WRITTEN && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', padding: '14px 16px', color: '#7DBDEE', fontSize: '13px', lineHeight: '1.7', fontStyle: 'italic' }}>"{pact.prompt}"</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pacts.length === 0 && !reviewMode && !uploading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}></span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>No pacts yet. Record your first promise to your future self.</p>
            </div>
          )}

          {/* Privacy */}
          <div className="dash-section" style={{ marginTop: '0.75rem' }}>
            <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.75rem' }}> Privacy</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', lineHeight: '1.5', margin: 0 }}>
              Your pacts are stored securely and only accessible to you. Delete them anytime.
            </p>
          </div>

          <p style={{ color: '#7DBDEE', fontSize: '10px', textAlign: 'center', fontStyle: 'italic', padding: '0.75rem 0 0' }}>
             Your future self will thank you.
          </p>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '340px', width: '100%', textAlign: 'center' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}></span>
              <h3 style={{ color: '#FFFFFF', fontSize: '15px', marginBottom: '6px' }}>Delete this pact?</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '14px' }}>This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm.id, deleteConfirm.path, deleteConfirm.isLocal, deleteConfirm.localIndex)} className="btn-danger" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes voiceBar { 0%{height:5px} 100%{height:30px} }
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
