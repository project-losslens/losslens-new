import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createNotification } from '../../lib/notifications'
import { ensureCircleHash } from '../../lib/storage'
import { detectCrisis } from '../../lib/crisisDetection'

//  Constants
const ROOMS = [
  { id: 'check_in', name: 'Daily Check-In', icon: '', desc: 'Morning & evening mood sharing', expiry_hours: 24 },
  { id: 'urge_support', name: 'Urge Support', icon: '🆘', desc: 'Real-time help during urges', expiry_hours: 2 },
  { id: 'victory', name: 'Victory Circle', icon: '', desc: 'Celebrate wins big and small', expiry_hours: 168 },
  { id: 'slip_recovery', name: 'Slip & Recovery', icon: '', desc: 'No-judgment space for setbacks', expiry_hours: 24 },
  { id: 'family_friends', name: 'Family & Friends', icon: '', desc: 'For supporters of gamblers', expiry_hours: 168 },
]

const MAX_MESSAGE_LENGTH = 280
const MAX_MENTIONS = 3
const MESSAGE_COOLDOWN_MS = 3000
const PRESENCE_POLL_INTERVAL = 15000

const REACTIONS = [
  { key: 'reaction_support', emoji: '', label: 'Support' },
  { key: 'reaction_love', emoji: '', label: 'With you' },
  { key: 'reaction_fire', emoji: '', label: 'Fire' },
  { key: 'reaction_heart', emoji: '', label: 'Love' },
  { key: 'reaction_star', emoji: '', label: 'Star' },
]

const CHECK_IN_TEMPLATES = [
  "Today was hard because...",
  "I resisted an urge by...",
  "I'm grateful for...",
  "I need help with...",
  "One thing that helped today...",
]

const BLOCKED_PATTERNS = [/\b[\w.-]+@[\w.-]+\.\w+\b/g, /(?<!\d)(07\d{8}|\+254\d{9})(?!\d)/g]
const MENTION_REGEX = /@([A-Z][a-z]+ [A-Z][a-z]+)/g

const ANIMALS = ['Elephant', 'Lion', 'Giraffe', 'Zebra', 'Rhino', 'Cheetah', 'Leopard', 'Buffalo', 'Eagle', 'Crane']
const PREFIXES = ['Savannah', 'Pride', 'Acacia', 'Serengeti', 'Rift', 'Highland', 'Coastal', 'Forest', 'Plains', 'Valley']
const ANIMAL_EMOJI = { Elephant:'', Lion:'', Giraffe:'', Zebra:'', Rhino:'', Cheetah:'', Leopard:'', Buffalo:'', Eagle:'', Crane:'' }

function generateUserHash(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) { hash = ((hash << 5) - hash) + userId.charCodeAt(i); hash = hash & hash }
  return 'user_' + Math.abs(hash).toString(36).substring(0, 8)
}

function generateIdentity(userId) {
  const hash = generateUserHash(userId)
  const animalIndex = parseInt(hash.substring(5, 8), 36) % ANIMALS.length
  const prefixIndex = parseInt(hash.substring(0, 4), 36) % PREFIXES.length
  return { hash, animal: ANIMALS[animalIndex], prefix: PREFIXES[prefixIndex], displayName: `${PREFIXES[prefixIndex]} ${ANIMALS[animalIndex]}` }
}

function containsBlockedContent(message) { return BLOCKED_PATTERNS.some(p => p.test(message)) }
function containsCrisisContent(message) { return detectCrisis(message).crisis }
function extractMentions(text) {
  const mentions = []
  let match
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push(match[1].trim())
  }
  return mentions.slice(0, MAX_MENTIONS)
}

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);animation:slideInRight 0.3s ease-out;white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => { toast.style.animation = 'slideOutRight 0.3s ease-in forwards'; setTimeout(() => toast.remove(), 300) }, duration)
}

export default function TheCircle() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [identity, setIdentity] = useState(null)
  const [activeRoom, setActiveRoom] = useState(ROOMS[0].id)
  const [messages, setMessages] = useState([])
  const [messageIds, setMessageIds] = useState(new Set())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showCrisisBanner, setShowCrisisBanner] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [memberCounts, setMemberCounts] = useState({})
  const [replyTo, setReplyTo] = useState(null)
  const [lastSendTime, setLastSendTime] = useState(0)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userHashMap, setUserHashMap] = useState({})

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const channelRef = useRef(null)
  const pollRef = useRef(null)
  const presenceRef = useRef(null)
  const crisisTimerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { initUser(); return () => cleanup() }, [])
  useEffect(() => {
    if (userId && identity) {
      subscribeToRoom(activeRoom)
      fetchMessages(activeRoom)
      updatePresence(activeRoom)
      startPolling(activeRoom)
      startPresencePolling()
    }
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeRoom, userId, identity])
  useEffect(() => { scrollToBottom() }, [messages.length])
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      setShowScrollButton(!isNearBottom && messages.length > 0)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages.length])

  const cleanup = () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    if (presenceRef.current) clearInterval(presenceRef.current)
    if (crisisTimerRef.current) clearTimeout(crisisTimerRef.current)
  }

  const initUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id; setUserId(uid)
    const { data: profile } = await supabase.from('profiles').select('circle_user_hash, circle_display_name').eq('id', uid).single()
    const userHash = profile?.circle_user_hash || await ensureCircleHash(uid)
    const generatedIdentity = generateIdentity(uid)
    setIdentity({
      ...generatedIdentity,
      hash: userHash,
      displayName: profile?.circle_display_name || generatedIdentity.displayName,
    })
  }

  const scrollToBottom = () => {
    if (!showScrollButton) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  //  Single presence poll — less frequent
  const startPresencePolling = useCallback(() => {
    if (presenceRef.current) clearInterval(presenceRef.current)
    const fetchPresence = async () => {
      try {
        const { count } = await supabase.from('circle_room_members').select('*', { count: 'exact', head: true }).gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        setOnlineCount(count || 0)
        const counts = {}
        for (const r of ROOMS) {
          const { count: c } = await supabase.from('circle_room_members').select('*', { count: 'exact', head: true }).eq('room', r.id).gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          counts[r.id] = c || 0
        }
        setMemberCounts(counts)
      } catch (err) { /* silent */ }
    }
    fetchPresence()
    presenceRef.current = setInterval(fetchPresence, PRESENCE_POLL_INTERVAL)
  }, [])

  //  Use only Realtime, not polling
  const subscribeToRoom = (room) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase.channel(`circle_${room}_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: `room=eq.${room}` }, (payload) => {
        setMessages(prev => {
          if (messageIds.has(payload.new.id)) return prev
          setMessageIds(s => new Set([...s, payload.new.id]))
          return [...prev, payload.new].slice(-150)
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'circle_messages', filter: `room=eq.${room}` }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        setMessageIds(s => { const ns = new Set(s); ns.delete(payload.old.id); return ns })
      })
      .subscribe()
    channelRef.current = channel
  }

  const startPolling = (room) => {
    if (pollRef.current) clearInterval(pollRef.current)
    //  Fallback polling every 10s as backup for Realtime
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.from('circle_messages').select('id, room, user_hash, display_name, avatar_animal, avatar_prefix, message, message_type, expires_at, reply_to_id, reply_to_name, created_at').eq('room', room).order('created_at', { ascending: true }).limit(150)
        if (data) {
          setMessages(data)
          setMessageIds(new Set(data.map(m => m.id)))
        }
      } catch (err) { /* silent */ }
    }, 10000)
  }

  const fetchMessages = async (room) => {
    try {
      const { data } = await supabase.from('circle_messages').select('id, room, user_hash, display_name, avatar_animal, avatar_prefix, message, message_type, expires_at, reply_to_id, reply_to_name, created_at').eq('room', room).order('created_at', { ascending: true }).limit(150)
      if (data) {
        setMessages(data)
        setMessageIds(new Set(data.map(m => m.id)))
      }
    } catch (err) { /* silent */ }
  }

  const updatePresence = async (room) => {
    if (!identity || !userId) return
    try {
      const userHash = await ensureCircleHash(userId)
      await supabase.from('circle_room_members').upsert({ room, user_hash: userHash, last_seen: new Date().toISOString() }, { onConflict: 'room,user_hash' })
    } catch (err) { /* silent */ }
  }

  //  Map user_hash to user_id for notifications
  const resolveUserHash = async (displayName) => {
    if (userHashMap[displayName]) return userHashMap[displayName]
    try {
      const { data } = await supabase.from('profiles').select('id, circle_user_hash').eq('circle_display_name', displayName).limit(1).single()
      if (data) {
        setUserHashMap(prev => ({ ...prev, [displayName]: data.id }))
        return data.id
      }
    } catch (err) { /* not found */ }
    return null
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !identity || sending) return

    if (containsCrisisContent(text)) {
      setShowCrisisBanner(true)
      if (crisisTimerRef.current) clearTimeout(crisisTimerRef.current)
      crisisTimerRef.current = setTimeout(() => setShowCrisisBanner(false), 10000)
    }
    if (containsBlockedContent(text)) { showToast(' Please don\'t share personal information.', 4000); return }

    //  Rate limiting
    const now = Date.now()
    if (now - lastSendTime < MESSAGE_COOLDOWN_MS) { showToast('Slow down!', 1500); return }
    setLastSendTime(now)

    setSending(true); setInput(''); setShowTemplates(false)
    const replyData = replyTo; setReplyTo(null)

    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const msgData = {
      id: tempId, room: activeRoom, user_hash: identity.hash, display_name: identity.displayName,
      avatar_animal: identity.animal || 'Elephant', avatar_prefix: identity.prefix || 'Savannah',
      message: text.substring(0, MAX_MESSAGE_LENGTH), message_type: 'text', created_at: new Date().toISOString(),
      reaction_support: 0, reaction_love: 0, reaction_fire: 0, reaction_heart: 0, reaction_star: 0,
      _sending: true,
      reply_to: replyData ? { id: replyData.id, name: replyData.name, message: replyData.message?.substring(0, 50), userId: replyData.userId } : null
    }
    setMessages(prev => [...prev, msgData])

    const expiryHours = ROOMS.find(r => r.id === activeRoom)?.expiry_hours || 24
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiryHours)

    try {
      const { data, error } = await supabase.from('circle_messages').insert({
        room: activeRoom, user_hash: identity.hash, display_name: identity.displayName,
        avatar_animal: identity.animal || 'Elephant', avatar_prefix: identity.prefix || 'Savannah',
        message: text.substring(0, MAX_MESSAGE_LENGTH), message_type: 'text', expires_at: expiresAt.toISOString(),
        reply_to_id: replyData?.id || null, reply_to_name: replyData?.name || null,
      }).select().single()

      if (error || !data) throw error

      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, _sending: false, _delivered: true, reply_to: replyData ? { id: replyData.id, name: replyData.name, message: replyData.message?.substring(0, 50), userId: replyData.userId } : null } : m))
      setTimeout(() => setMessages(prev => prev.map(m => m.id === data.id ? { ...m, _delivered: false } : m)), 2000)

      //  Send mention notifications — properly resolve user IDs
      const mentions = extractMentions(text)
      for (const mention of mentions) {
        const mentionedUserId = await resolveUserHash(mention)
        if (mentionedUserId && mentionedUserId !== userId) {
          try {
            await createNotification(mentionedUserId, { title: ' You were mentioned', message: `${identity.displayName} mentioned you in The Circle`, type: 'info', icon: '', link: '/circle' })
          } catch (err) { /* silent */ }
        }
      }

      // Send reply notification
      if (replyData?.userId && replyData.userId !== userId) {
        try {
          await createNotification(replyData.userId, { title: '↩ Someone replied to you', message: `${identity.displayName} replied in The Circle`, type: 'info', icon: '↩', link: '/circle' })
        } catch (err) { /* silent */ }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m))
      showToast('Failed to send', 3000)
    }
    setSending(false)
  }

  const handleReply = (msg) => {
    setReplyTo({ id: msg.id, name: msg.display_name, message: msg.message, userId: msg.user_hash })
    inputRef.current?.focus()
  }

  const retryMessage = (msg) => { setMessages(prev => prev.filter(m => m.id !== msg.id)); setInput(msg.message) }
  const handleTemplate = (t) => { setInput(t); setShowTemplates(false) }

  const handleReaction = async (msgId, key) => {
    if (!identity || msgId.startsWith('temp_')) return
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, [key]: (m[key] || 0) + 1 } : m))
    try { await supabase.rpc('increment_reaction', { msg_id: msgId, reaction_col: key }) } catch (err) { /* silent */ }
  }

  const handleDeleteMessage = async (msgId) => {
    if (msgId.startsWith('temp_')) return
    try {
      await supabase.from('circle_messages').delete().eq('id', msgId).eq('user_hash', identity?.hash)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) { /* silent */ }
  }

  const formatTime = (d) => {
    const diff = new Date() - new Date(d)
    if (diff < 0) return 'Just now'
    if (diff < 60000) return 'Now'
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h`
    return new Date(d).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })
  }

  const getAvatarEmoji = (a) => ANIMAL_EMOJI[a] || ''
  const activeRoomData = useMemo(() => ROOMS.find(r => r.id === activeRoom), [activeRoom])

  if (!identity) return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
    </div>
  )

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> The Circle</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{onlineCount} online  · You: {getAvatarEmoji(identity.animal)} {identity.displayName}</p>
          </div>
        </div>

        {showCrisisBanner && (
          <div style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', padding: '12px 1.5rem', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🆘 If you're in crisis: call Befrienders Kenya <strong>0800 722 030</strong></span>
            <button onClick={() => { setShowCrisisBanner(false); if (crisisTimerRef.current) clearTimeout(crisisTimerRef.current) }} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '20px', cursor: 'pointer', padding: '4px 10px', minWidth: '44px', minHeight: '44px' }} aria-label="Dismiss crisis banner">×</button>
          </div>
        )}

        {/* Room Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '0.75rem 1rem', overflowX: 'auto', background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.12)', flexShrink: 0, WebkitOverflowScrolling: 'touch' }}>
          {ROOMS.map(room => (
            <button key={room.id} onClick={() => setActiveRoom(room.id)} style={{ padding: '8px 14px', borderRadius: '100px', border: 'none', background: activeRoom === room.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeRoom === room.id ? '#2DD4BF' : '#2DD4BF', fontSize: '12px', fontWeight: activeRoom === room.id ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }} role="tab" aria-selected={activeRoom === room.id}>
              <span>{room.icon}</span><span>{room.name}</span>
              {memberCounts[room.id] > 0 && <span style={{ fontSize: '10px', background: '#2DD4BF', color: '#0B1220', padding: '1px 6px', borderRadius: '100px', fontWeight: 600 }}>{memberCounts[room.id]}</span>}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', position: 'relative' }}>
          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} style={{ position: 'sticky', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 'var(--z-content)', background: 'rgba(255,255,255,0.12)', border: '1px solid #2DD4BF', borderRadius: '100px', padding: '6px 16px', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: '0 2px 12px rgba(11,18,32,0.4)' }}>↓ New messages</button>
          )}

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
              <p style={{ fontSize: '32px' }}></p>
              <p style={{ fontSize: '14px', color: '#2DD4BF' }}>No messages yet</p>
              <p style={{ fontSize: '12px' }}>Be the first to share in {activeRoomData?.name}.</p>
            </div>
          )}

          {messages.map(msg => {
            const isOwn = msg.user_hash === identity.hash
            return (
              <div key={msg.id} style={{ display: 'flex', gap: '8px', flexDirection: isOwn ? 'row-reverse' : 'row', marginBottom: '12px', animation: 'fadeIn 0.2s ease-out', opacity: msg._sending ? 0.7 : 1 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: `2px solid ${isOwn ? '#2DD4BF' : '#7DBDEE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{getAvatarEmoji(msg.avatar_animal)}</div>
                <div style={{ maxWidth: '78%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexDirection: isOwn ? 'row-reverse' : 'row', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', color: isOwn ? '#2DD4BF' : '#2DD4BF', fontWeight: 500 }}>{msg.display_name}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }} title={new Date(msg.created_at).toLocaleString('en-KE')}>{formatTime(msg.created_at)}</span>
                    {msg._sending && <span style={{ fontSize: '10px', color: '#7DBDEE' }}>sending...</span>}
                    {msg._delivered && <span style={{ fontSize: '10px', color: '#2DD4BF' }}></span>}
                    {msg._failed && <span onClick={() => retryMessage(msg)} style={{ fontSize: '10px', color: '#FFFFFF', cursor: 'pointer', textDecoration: 'underline' }}> Retry</span>}
                  </div>
                  {msg.reply_to && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px', padding: '4px 8px', background: '#0B1220', borderRadius: '6px', borderLeft: '2px solid #2DD4BF' }}>
                      ↩ <strong>{msg.reply_to.name}</strong>: "{msg.reply_to.message}..."
                    </div>
                  )}
                  <div style={{ padding: '10px 14px', borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${msg._failed ? 'rgba(255,255,255,0.08)' : isOwn ? '#7DBDEE' : 'rgba(255,255,255,0.12)'}`, color: '#7DBDEE', fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                    {msg.message}
                  </div>
                  {!msg._sending && !msg._failed && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexDirection: isOwn ? 'row-reverse' : 'row', flexWrap: 'wrap', opacity: 0.7 }}>
                      <button onClick={() => handleReply(msg)} style={{ background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '2px 8px', fontSize: '10px', color: '#2DD4BF', cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-label="Reply">↩</button>
                      {REACTIONS.filter(r => (msg[r.key] || 0) > 0).map(r => (
                        <button key={r.key} onClick={() => handleReaction(msg.id, r.key)} style={{ background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '2px 8px', fontSize: '11px', color: '#2DD4BF', cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-label={`${r.label} (${msg[r.key]})`}>{r.emoji} {msg[r.key]}</button>
                      ))}
                      {isOwn && <button onClick={() => handleDeleteMessage(msg.id)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', padding: '2px 4px' }} aria-label="Delete message"></button>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 1.5rem', borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.12)', borderRadius: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#2DD4BF', flex: 1 }}>↩ Replying to <strong>{replyTo.name}</strong></span>
              <button onClick={() => setReplyTo(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '16px', cursor: 'pointer', padding: '4px 8px' }} aria-label="Cancel reply"></button>
            </div>
          )}
          {showTemplates && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {CHECK_IN_TEMPLATES.map(t => <button key={t} onClick={() => handleTemplate(t)} style={{ background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '6px 12px', borderRadius: '100px', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{t}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowTemplates(!showTemplates)} style={{ width: '36px', height: '36px', borderRadius: '8px', background: showTemplates ? 'rgba(255,255,255,0.12)' : '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '14px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Message templates"></button>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value.substring(0, MAX_MESSAGE_LENGTH))} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={replyTo ? `Reply to ${replyTo.name}...` : `Share... (${MAX_MESSAGE_LENGTH - input.length})`} style={{ flex: 1, background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '10px 16px', color: '#FFFFFF', fontSize: '16px', outline: 'none', fontFamily: 'var(--font-body)' }} aria-label="Type a message" />
            <button onClick={handleSend} disabled={!input.trim() || sending} style={{ width: '40px', height: '40px', borderRadius: '50%', background: input.trim() && !sending ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: input.trim() && !sending ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Send message">→</button>
          </div>
          <p style={{ fontSize: '10px', color: '#7DBDEE', textAlign: 'center', marginTop: '6px', marginBottom: 0 }}>Anonymous  · Use @Name to tag  · Be kind </p>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
