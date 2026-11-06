import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

//  Constants
const MAX_ACTIVE_CHATS = 3
const MAX_PENDING_REQUESTS = 3
const MAX_MESSAGE_LENGTH = 500
const MESSAGE_COOLDOWN_MS = 1000
const POLL_INTERVAL = 3000
const REQUEST_POLL_INTERVAL = 5000

const ANIMALS = ['', '', '', '', '', '', '', '', '', '']
const PREFIXES = ['Sage', 'River', 'Cloud', 'Star', 'Pine', 'Luna', 'Wild', 'Calm', 'Dawn', 'Fern']

const CONVERSATION_STARTERS = [
  "What brought you here today?",
  "How are you feeling right now?",
  "What's been helping you lately?",
]

const REQUEST_MESSAGES = [
  "Looking for someone to talk to about cravings",
  "Need support with weekend triggers",
  "Want to share coping strategies",
  "Just need someone who understands",
  "Struggling today â€” could use a chat",
  "Open to listening or sharing",
]

const CRISIS_KEYWORDS = ['suicide', 'kill myself', 'end it all', 'self-harm', 'want to die', 'hopeless', 'kujiua', 'nataka kufa']
const BLOCKED_PATTERNS = [/\d{10,}/g, /\b[\w.-]+@[\w.-]+\.\w+\b/g, /07\d{8}/g, /\+254\d{9}/g]

function generateUserHash(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) { hash = ((hash << 5) - hash) + userId.charCodeAt(i); hash = hash & hash }
  return 'user_' + Math.abs(hash).toString(36).substring(0, 8)
}

function generateAnonymousName(userId, roomId) {
  let combined = userId + roomId
  let hash = 0
  for (let i = 0; i < combined.length; i++) { hash = ((hash << 5) - hash) + combined.charCodeAt(i); hash = hash & hash }
  return `${PREFIXES[Math.abs(hash) % PREFIXES.length]} ${ANIMALS[Math.abs(hash + 1) % ANIMALS.length]}`
}

function containsBlockedContent(message) { return BLOCKED_PATTERNS.some(p => p.test(message)) }
function containsCrisisContent(message) { return CRISIS_KEYWORDS.some(w => message.toLowerCase().includes(w)) }

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function Whispers() {
  const [identity, setIdentity] = useState(null)
  const [activeMatch, setActiveMatch] = useState(null)
  const [matches, setMatches] = useState([])
  const [messages, setMessages] = useState([])
  const [messageInputs, setMessageInputs] = useState({})
  const [sending, setSending] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [rating, setRating] = useState(null)
  const [showStarters, setShowStarters] = useState(false)
  const [activeTab, setActiveTab] = useState('requests')
  const [requestMessage, setRequestMessage] = useState(REQUEST_MESSAGES[0])
  const [sendingRequest, setSendingRequest] = useState(false)
  const [peerAnonName, setPeerAnonName] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [lastSendTime, setLastSendTime] = useState(0)

  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)
  const requestPollRef = useRef(null)
  const identityRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { initUser(); return () => cleanup() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (activeMatch) { fetchMatchMessages(activeMatch.id); startMessagePolling(activeMatch.id); generateChatName(activeMatch) }
    else { if (pollRef.current) clearInterval(pollRef.current) }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeMatch?.id])
  useEffect(() => {
    if (identity) { identityRef.current = identity; startRequestPolling() }
    return () => { if (requestPollRef.current) clearInterval(requestPollRef.current) }
  }, [identity?.hash])

  const cleanup = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (requestPollRef.current) clearInterval(requestPollRef.current)
  }

  const initUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id
    const { data: profile } = await supabase.from('profiles').select('circle_user_hash').eq('id', uid).single()
    let hash = profile?.circle_user_hash
    if (!hash) { hash = generateUserHash(uid); await supabase.from('profiles').update({ circle_user_hash: hash }).eq('id', uid) }
    setIdentity({ hash, uid })
    identityRef.current = { hash, uid }
    fetchMatches(hash)
  }

  const generateChatName = useCallback((room) => {
    if (!identity || !room) return
    const peerHash = room.user1_hash === identity.hash ? room.user2_hash : room.user1_hash
    setPeerAnonName(generateAnonymousName(peerHash || room.id, room.id))
  }, [identity])

  const fetchMatches = async (hash) => {
    if (!hash) return
    const { data } = await supabase.from('whispers_matches').select('*').or(`user1_hash.eq.${hash},user2_hash.eq.${hash}`).order('created_at', { ascending: false }).limit(30)
    setMatches(data || [])
  }

  const startRequestPolling = useCallback(() => {
    if (requestPollRef.current) clearInterval(requestPollRef.current)
    requestPollRef.current = setInterval(() => {
      const hash = identityRef.current?.hash
      if (hash) fetchMatches(hash)
    }, REQUEST_POLL_INTERVAL)
  }, [])

  const startMessagePolling = useCallback((matchId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let lastMsgId = null
    pollRef.current = setInterval(async () => {
      try {
        let query = supabase.from('whispers_messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true })
        if (lastMsgId) query = query.gt('id', lastMsgId)
        const { data } = await query
        if (data && data.length > 0) {
          lastMsgId = data[data.length - 1].id
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            const newMsgs = data.filter(m => !existingIds.has(m.id))
            return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev
          })
        }
      } catch (err) { /* silent */ }
    }, POLL_INTERVAL)
  }, [])

  const fetchMatchMessages = async (matchId) => {
    const { data } = await supabase.from('whispers_messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true })
    setMessages(data || [])
  }

  const sendRequest = async () => {
    if (!identity) return
    if (matches.filter(m => m.status === 'pending' && m.user1_hash === identity.hash).length >= MAX_PENDING_REQUESTS) { showToast('You have too many pending requests. Cancel one first.'); return }
    if (matches.filter(m => m.status === 'active' && m.user2_hash).length >= MAX_ACTIVE_CHATS) { showToast('Maximum active chats reached. End one first.'); return }
    setSendingRequest(true)
    try {
      const { data, error } = await supabase.from('whispers_matches').insert({
        user1_hash: identity.hash, user1_role: 'flexible', status: 'pending',
        request_message: requestMessage.substring(0, 140), request_type: 'request',
      }).select().single()
      if (error) throw error
      setMatches(prev => [data, ...prev])
      showToast(' Request sent!', 3000)
      setActiveTab('sent')
    } catch (err) { showToast('Failed to send.', 2000) }
    setSendingRequest(false)
  }

  const acceptRequest = async (matchId) => {
    if (!identity) return
    try {
      const { data, error } = await supabase.from('whispers_matches').update({
        user2_hash: identity.hash, user2_role: 'flexible', status: 'active',
      }).eq('id', matchId).is('user2_hash', null).select().single()
      if (error) {
        if (error.code === 'PGRST116') { showToast('This request was already taken.'); fetchMatches(identity.hash); return }
        throw error
      }
      setMatches(prev => prev.map(m => m.id === matchId ? data : m))
      setActiveMatch(data)
      showToast(' Chat opened!', 3000)
    } catch (err) { showToast('Failed to accept.', 2000) }
  }

  const rejectRequest = async (matchId) => {
    if (!identity) return
    try {
      await supabase.from('whispers_matches').update({
        status: 'rejected', rejected_at: new Date().toISOString(),
        rejected_by: identity.hash,
      }).eq('id', matchId).is('user2_hash', null)
      showToast('Declined.', 2000)
      fetchMatches(identity.hash)
    } catch (err) { showToast('Failed.', 2000) }
  }

  const cancelRequest = async (matchId) => {
    //  Only cancel if still pending
    const match = matches.find(m => m.id === matchId)
    if (match?.status !== 'pending') { showToast('Cannot cancel this request.'); return }
    try {
      await supabase.from('whispers_matches').update({ status: 'cancelled' }).eq('id', matchId).eq('user1_hash', identity.hash)
      showToast('Cancelled.', 2000)
      fetchMatches(identity.hash)
    } catch (err) { showToast('Failed.', 2000) }
  }

  const handleSend = async (matchId) => {
    const text = (messageInputs[matchId] || '').trim()
    if (!text || !identity || sending) return

    //  Content moderation
    if (containsCrisisContent(text)) {
      showToast('ðŸ†˜ If you or someone is in crisis, please call Befrienders Kenya: +254 722 178 177', 5000)
    }
    if (containsBlockedContent(text)) { showToast(' Please don\'t share personal info.', 4000); return }

    //  Rate limiting
    const now = Date.now()
    if (now - lastSendTime < MESSAGE_COOLDOWN_MS) { showToast('Slow down!', 1500); return }
    setLastSendTime(now)

    if (text.length > MAX_MESSAGE_LENGTH) { showToast(`Message too long. Max ${MAX_MESSAGE_LENGTH} characters.`, 2000); return }

    setSending(true)
    const tempId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optMsg = { id: tempId, match_id: matchId, sender_hash: identity.hash, message: text, created_at: new Date().toISOString(), sending: true, reply_to: replyTo }
    setMessages(prev => [...prev, optMsg])
    setMessageInputs(prev => ({ ...prev, [matchId]: '' }))
    setShowStarters(false)
    setReplyTo(null)

    try {
      const { data, error } = await supabase.from('whispers_messages').insert({
        match_id: matchId, sender_hash: identity.hash, message: text.substring(0, MAX_MESSAGE_LENGTH),
        reply_to_id: replyTo?.id || null,
      }).select().single()
      if (error || !data) throw error
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, sending: false } : m))
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      showToast('Failed to send', 2000)
    }
    setSending(false)
  }

  const handleReply = (msg) => { setReplyTo(msg); setTimeout(() => inputRef.current?.focus(), 100) }

  const handleReport = async () => {
    if (!activeMatch || !identity || !reportReason.trim()) return
    setSubmittingReport(true)
    try {
      await supabase.from('whispers_reports').insert({
        match_id: activeMatch.id,
        reporter_hash: identity.hash,
        reason: reportReason.trim(),
      })
      showToast('Report submitted. Chat ended.', 3000)
      setShowReportModal(false)
      setReportReason('')
      setActiveMatch(null)
      setMessages([])
    } catch (err) { showToast('Failed to submit report.', 2000) }
    setSubmittingReport(false)
  }

  const submitFeedback = async () => {
    if (!activeMatch || !identity) return
    try {
      const isU1 = activeMatch.user1_hash === identity.hash
      await supabase.from('whispers_matches').update({
        status: 'ended', ended_at: new Date().toISOString(),
        [isU1 ? 'user1_feedback' : 'user2_feedback']: feedback || null,
        [isU1 ? 'user1_rating' : 'user2_rating']: rating,
      }).eq('id', activeMatch.id)
      showToast('Thank you ', 3000)
      fetchMatches(identity.hash)
    } catch (err) { showToast('Failed to submit.', 2000) }
    setShowFeedback(false)
    setActiveMatch(null)
    setMessages([])
    setFeedback('')
    setRating(null)
  }

  const formatTime = (d) => {
    const diff = new Date() - new Date(d)
    if (diff < 0) return 'Just now'
    if (diff < 60000) return 'Now'
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`
    return new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  }

  const pendingReceived = useMemo(() => matches.filter(m => m.status === 'pending' && m.user1_hash !== identity?.hash && !m.user2_hash), [matches, identity])
  const pendingSent = useMemo(() => matches.filter(m => m.status === 'pending' && m.user1_hash === identity?.hash), [matches, identity])
  const activeChats = useMemo(() => matches.filter(m => m.status === 'active' && m.user2_hash), [matches])
  const canSend = pendingSent.length < MAX_PENDING_REQUESTS && activeChats.length < MAX_ACTIVE_CHATS

  if (!identity) return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
    </div>
  )

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#0B1220', borderBottom: '1px solid rgba(255,255,255,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div><h1 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Whispers</h1><p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>Anonymous peer support Â· {activeChats.length} active</p></div>
        </nav>

        <div style={{ height: 'calc(100vh - 60px)', maxHeight: 'calc(100dvh - 60px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeMatch ? (
            <>
              <div style={{ background: 'rgba(255,255,255,0.12)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #7DBDEE', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <button onClick={() => { setActiveMatch(null); setMessages([]); setMessageInputs({}) }} style={{ background: 'transparent', border: 'none', color: '#2DD4BF', fontSize: '18px', cursor: 'pointer', padding: '6px 10px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Back to chats">â†</button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #7DBDEE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }} aria-hidden="true"></div>
                  <div><p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: 0 }}>{peerAnonName || 'Anonymous Peer'}</p><p style={{ color: '#2DD4BF', fontSize: '10px', margin: 0 }}>Chat active</p></div>
                </div>
                <button onClick={() => setShowReportModal(true)} style={{ background: 'transparent', border: '1px solid #7DBDEE', color: '#7DBDEE', padding: '6px 10px', borderRadius: '100px', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minHeight: '32px' }}> Report</button>
                <button onClick={() => setShowFeedback(true)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', padding: '6px 10px', borderRadius: '100px', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minHeight: '32px' }}>End</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px', background: '#0B1220', WebkitOverflowScrolling: 'touch' }}>
                {showStarters && messages.length === 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '1rem' }}>
                    {CONVERSATION_STARTERS.map(s => <button key={s} onClick={() => { setMessageInputs(prev => ({ ...prev, [activeMatch.id]: s })); setShowStarters(false) }} style={{ padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.12)', border: '1px solid #7DBDEE', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{s}</button>)}
                  </div>
                )}
                {messages.map(msg => {
                  const isOwn = msg.sender_hash === identity.hash
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: '4px' }}>
                      <div style={{ maxWidth: '82%' }}>
                        {msg.reply_to && (
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px', padding: '3px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', borderLeft: '2px solid #2DD4BF' }}>
                            â†© Replying to: "{msg.reply_to.message?.substring(0, 40)}..."
                          </div>
                        )}
                        <div style={{ padding: '8px 12px', borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isOwn ? '#7DBDEE' : 'rgba(255,255,255,0.12)'}`, color: '#7DBDEE', fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word', opacity: msg.sending ? 0.6 : 1 }}>
                          {msg.message}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{msg.sending ? 'Sending...' : formatTime(msg.created_at)}</span>
                          <button onClick={() => handleReply(msg)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', padding: '2px 6px' }} aria-label="Reply">â†©</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(255,255,255,0.12)', borderTop: '1px solid #7DBDEE', flexShrink: 0 }}>
                  <span style={{ color: '#2DD4BF', fontSize: '10px', flex: 1 }}>â†© Replying to: "{replyTo.message.substring(0, 30)}..."</span>
                  <button onClick={() => setReplyTo(null)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '14px', cursor: 'pointer', padding: '4px 8px' }} aria-label="Cancel reply"></button>
                </div>
              )}

              <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => setShowStarters(!showStarters)} style={{ width: '36px', height: '36px', borderRadius: '6px', background: showStarters ? 'rgba(255,255,255,0.12)' : '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '14px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Conversation starters"></button>
                  <input ref={inputRef} value={messageInputs[activeMatch.id] || ''} onChange={e => setMessageInputs(prev => ({ ...prev, [activeMatch.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSend(activeMatch.id)} placeholder="Message" style={{ flex: 1, background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '10px 12px', color: '#FFFFFF', fontSize: '16px', outline: 'none', fontFamily: "'Inter', sans-serif" }} aria-label="Type a message" />
                  <button onClick={() => handleSend(activeMatch.id)} disabled={!messageInputs[activeMatch.id]?.trim() || sending} style={{ width: '40px', height: '40px', borderRadius: '50%', background: messageInputs[activeMatch.id]?.trim() && !sending ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: messageInputs[activeMatch.id]?.trim() ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '16px', cursor: messageInputs[activeMatch.id]?.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Send message">â†’</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
                {[{ id: 'requests', label: ' Requests', count: pendingReceived.length }, { id: 'sent', label: ' Sent', count: pendingSent.length }, { id: 'chats', label: ' Chats', count: activeChats.length }].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}</button>
                ))}
              </div>

              {activeTab === 'requests' && (
                <>
                  <div className="dash-section" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
                    <h3 style={{ color: '#FFFFFF', fontSize: '13px', marginBottom: '4px' }}>Find a peer</h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '0.75rem' }}>Your request goes to a random available peer. Your identity stays anonymous.</p>
                    {canSend ? (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                          {REQUEST_MESSAGES.map(msg => <button key={msg} onClick={() => setRequestMessage(msg)} style={{ padding: '6px 10px', borderRadius: '100px', border: requestMessage === msg ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)', background: requestMessage === msg ? 'rgba(255,255,255,0.12)' : '#0B1220', color: requestMessage === msg ? '#2DD4BF' : '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{msg}</button>)}
                        </div>
                        <button className="btn-primary full" onClick={sendRequest} disabled={sendingRequest} style={{ fontSize: '12px', padding: '10px' }}>{sendingRequest ? '...' : ' Send request'}</button>
                      </>
                    ) : <p style={{ color: '#7DBDEE', fontSize: '12px', textAlign: 'center' }}>You've reached the limit. End an active chat or cancel a pending request first.</p>}
                  </div>
                  {pendingReceived.length > 0 && (
                    <div className="dash-section" style={{ marginBottom: '0.75rem' }}>
                      <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.75rem' }}> Incoming ({pendingReceived.length})</h3>
                      {pendingReceived.map(req => (
                        <div key={req.id} style={{ padding: '12px', background: '#0B1220', borderRadius: '8px', marginBottom: '6px', border: '1px solid #2DD4BF' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '20px' }} aria-hidden="true"></span>
                            <div style={{ flex: 1 }}><p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 500, margin: 0 }}>Anonymous Peer</p><p style={{ color: '#2DD4BF', fontSize: '10px' }}>"{req.request_message || 'Wants to connect'}"</p></div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => acceptRequest(req.id)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: '#2DD4BF', color: '#0B1220', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Accept</button>
                            <button onClick={() => rejectRequest(req.id)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#FFFFFF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingReceived.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textAlign: 'center', padding: '1rem' }}>No incoming requests. Try sending one!</p>}
                </>
              )}

              {activeTab === 'sent' && (
                <div className="dash-section">
                  <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.75rem' }}> Sent ({pendingSent.length})</h3>
                  {pendingSent.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '0.75rem' }}>No pending requests.</p><button className="btn-primary" onClick={() => setActiveTab('requests')} style={{ fontSize: '11px', padding: '8px 16px' }}> Send one</button></div>
                  ) : pendingSent.map(req => (
                    <div key={req.id} style={{ padding: '12px', background: '#0B1220', borderRadius: '8px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 500, margin: 0 }}>"{req.request_message || 'Request'}"</p><p style={{ color: '#7DBDEE', fontSize: '10px', marginTop: '3px' }}>â³ Waiting...</p></div>
                      <button onClick={() => cancelRequest(req.id)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '10px', cursor: 'pointer', flexShrink: 0, padding: '6px 10px' }}>Cancel</button>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'chats' && (
                <div className="dash-section">
                  <h3 style={{ color: '#FFFFFF', fontSize: '12px', marginBottom: '0.75rem' }}> Active chats ({activeChats.length})</h3>
                  {activeChats.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                      <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}></span>
                      <p style={{ color: '#2DD4BF', fontSize: '14px' }}>No active chats.</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Accept an incoming request or send one to start.</p>
                    </div>
                  ) : activeChats.map(m => (
                    <div key={m.id} onClick={() => setActiveMatch(m)} style={{ padding: '12px', background: '#0B1220', borderRadius: '8px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '24px' }} aria-hidden="true"></span>
                        <div><p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 500, margin: 0 }}>Peer Match</p><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{new Date(m.created_at).toLocaleDateString('en-KE')}</p></div>
                      </div>
                      <span style={{ color: '#2DD4BF', fontSize: '16px' }}>â†’</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback Modal */}
        {showFeedback && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11,18,32,0.92)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '360px', width: '100%' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '0.75rem' }}>How was this match?</h3>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '0.75rem' }}>
                {[{ value: 'helpful', emoji: '' }, { value: 'okay', emoji: '' }, { value: 'not_helpful', emoji: '' }].map(opt => (
                  <button key={opt.value} onClick={() => setRating(opt.value)} style={{ padding: '8px', borderRadius: '10px', border: rating === opt.value ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)', background: rating === opt.value ? 'rgba(255,255,255,0.12)' : '#0B1220', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>{opt.emoji}</button>
                ))}
              </div>
              <textarea placeholder="Any feedback? (optional)" value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} style={{ width: '100%', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '8px', color: '#FFFFFF', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '0.75rem', resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-primary full" onClick={submitFeedback} style={{ fontSize: '12px', padding: '10px', flex: 2 }}>Submit & end chat</button>
                <button onClick={() => { setShowFeedback(false); setActiveMatch(null); setMessages([]); fetchMatches(identity?.hash) }} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Skip</button>
              </div>
            </div>
          </div>
        )}

        {/* Report Modal */}
        {showReportModal && (
          <div onClick={() => setShowReportModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11,18,32,0.92)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.5rem', border: '1px solid #7DBDEE', maxWidth: '360px', width: '100%' }}>
              <h3 style={{ color: '#7DBDEE', fontSize: '14px', marginBottom: '0.75rem' }}> Report this chat</h3>
              <p style={{ color: '#2DD4BF', fontSize: '12px', marginBottom: '0.75rem' }}>Your safety matters. Reports are anonymous and reviewed by our team.</p>
              <textarea placeholder="Briefly describe the issue..." value={reportReason} onChange={e => setReportReason(e.target.value)} rows={3} style={{ width: '100%', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '8px', color: '#FFFFFF', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '0.75rem', resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setShowReportModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
                <button onClick={handleReport} disabled={!reportReason.trim() || submittingReport} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: reportReason.trim() ? '#7DBDEE' : 'rgba(255,255,255,0.12)', border: 'none', color: reportReason.trim() ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: reportReason.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>{submittingReport ? '...' : 'Submit report'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
