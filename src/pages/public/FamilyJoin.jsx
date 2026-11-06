import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'

//  Constants for permissions
const PERMISSIONS = {
  STREAK: 'Streak status',
  GOAL: 'Goal progress',
  MOOD: 'General mood',
  MODULES: 'Module progress',
  EVENTS: 'Event attendance',
  DIARY: 'Diary summary',
  RISK: 'Risk level',
}

const RISK_LABELS = {
  high: { bg: 'rgba(255,255,255,0.08)', color: '#FFFFFF', label: 'Going through a tough time' },
  medium: { bg: 'rgba(45,212,191,0.15)', color: '#7DBDEE', label: 'Managing okay' },
  low: { bg: 'rgba(255,255,255,0.12)', color: '#2DD4BF', label: 'Doing well' },
}

const MOOD_LABELS = {
  ' Calm': 'Calm', ' Stressed': 'Stressed', ' Anxious': 'Anxious',
  ' Depressed': 'Low', ' Happy': 'Happy',
}

export default function FamilyJoin() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const messageTimer = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [userStats, setUserStats] = useState(null)
  const [status, setStatus] = useState('loading')
  const [acting, setActing] = useState(false)
  const [actError, setActError] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [messages, setMessages] = useState([])
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageSent, setMessageSent] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)

  //  Cleanup timer
  useEffect(() => { return () => { if (messageTimer.current) clearTimeout(messageTimer.current) } }, [])

  //  Validate token on mount
  useEffect(() => {
    if (!token) { setError('No invitation token found.'); setStatus('invalid'); setLoading(false); return }
    validateToken()
  }, [token])

  const validateToken = async () => {
    try {
      const { data, error: fetchError } = await supabase.from('supporter_invitations').select('*').eq('token', token).single()
      if (fetchError || !data) { setError('This invitation link is invalid or has expired.'); setStatus('invalid'); setLoading(false); return }
      setInvitation(data)
      if (data.status === 'active') { await loadUserData(data); setStatus('view') }
      else if (data.status === 'declined') { setStatus('declined') }
      else if (data.status === 'expired') { setError('This invitation has expired.'); setStatus('invalid') }
      else { setStatus('pending') }
    } catch (err) {
      console.error('Token validation error:', err)
      setError('Something went wrong. Please try again.')
      setStatus('invalid')
    } finally { setLoading(false) }
  }

  //  Parallelized data loading
  const loadUserData = async (inv) => {
    const permissions = inv.permissions || []
    const isAnonymous = inv.anonymous_mode

    try {
      const promises = []

      // Profile
      promises.push(supabase.from('profiles').select('*').eq('id', inv.user_id).single())

      // Diary entries
      if (permissions.includes(PERMISSIONS.MOOD)) {
        promises.push(supabase.from('diary_entries').select('mood, date, gambled').eq('user_id', inv.user_id).order('date', { ascending: false }).limit(7))
      } else { promises.push(Promise.resolve({ data: null })) }

      // CBT progress
      if (permissions.includes(PERMISSIONS.MODULES)) {
        promises.push(supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('user_id', inv.user_id).eq('completed', true))
      } else { promises.push(Promise.resolve({ count: 0 })) }

      // Messages
      promises.push(supabase.from('supporter_messages').select('*').eq('invitation_id', inv.id).order('created_at', { ascending: true }))

      const [profileRes, diaryRes, cbtRes, msgsRes] = await Promise.all(promises)

      if (!isAnonymous && profileRes.data) setUserProfile(profileRes.data)

      const stats = {}
      if (profileRes.data) {
        if (permissions.includes(PERMISSIONS.STREAK)) {
          stats.streak = profileRes.data.streak_days || 0
          stats.moneySaved = profileRes.data.money_saved || 0
        }
        if (permissions.includes(PERMISSIONS.GOAL)) stats.goal = profileRes.data.goal || 'Abstinence'
        if (permissions.includes(PERMISSIONS.MOOD)) stats.recentMoods = diaryRes.data || []
        if (permissions.includes(PERMISSIONS.MODULES)) stats.cbtCompleted = cbtRes.count || 0
        if (permissions.includes(PERMISSIONS.RISK)) stats.riskLevel = profileRes.data.risk_level || 'low'
      }
      setUserStats(stats)
      setMessages(msgsRes.data || [])
    } catch (err) {
      console.error('Error loading user data:', err)
    }
  }

  //  Error-handled accept
  const handleAccept = async () => {
    setActing(true); setActError('')
    try {
      const { error: acceptError } = await supabase.from('supporter_invitations').update({ status: 'active', responded_at: new Date().toISOString() }).eq('id', invitation.id)
      if (acceptError) throw acceptError
      setInvitation(prev => ({ ...prev, status: 'active' }))
      await loadUserData({ ...invitation, status: 'active' })
      setStatus('view')
    } catch (err) { setActError('Failed to accept. Please try again.') }
    finally { setActing(false) }
  }

  //  Error-handled decline
  const handleDecline = async () => {
    setActing(true); setActError('')
    try {
      await supabase.from('supporter_invitations').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', invitation.id)
      setStatus('declined')
    } catch (err) { setActError('Failed. Please try again.') }
    finally { setActing(false) }
  }

  //  Error-handled stop supporting with modal
  const handleStopSupporting = async () => {
    setShowStopModal(false); setActing(true); setActError('')
    try {
      await supabase.from('supporter_invitations').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', invitation.id)
      setStatus('declined')
    } catch (err) { setActError('Failed. Please try again.') }
    finally { setActing(false) }
  }

  //  Content-moderated send with cleanup
  const sendMessage = async () => {
    const content = messageInput.trim()
    if (!content || content.length > 500) return
    setSendingMessage(true)
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, { id: tempId, invitation_id: invitation.id, sender: 'supporter', content, created_at: new Date().toISOString() }])
    setMessageInput('')

    try {
      const { error: msgError } = await supabase.from('supporter_messages').insert({ invitation_id: invitation.id, sender: 'supporter', content })
      if (msgError) { setMessages(prev => prev.filter(m => m.id !== tempId)); return }
      setMessageSent(true)
      if (messageTimer.current) clearTimeout(messageTimer.current)
      messageTimer.current = setTimeout(() => setMessageSent(false), 3000)
    } catch (err) { setMessages(prev => prev.filter(m => m.id !== tempId)) }
    finally { setSendingMessage(false) }
  }

  const getMoodEmoji = (mood) => {
    if (!mood) return 'Ã¢Ââ€œ'
    if (mood.includes('Calm')) return ''
    if (mood.includes('Stressed')) return ''
    if (mood.includes('Anxious')) return ''
    if (mood.includes('Happy')) return ''
    if (mood.includes('Depressed')) return ''
    return ''
  }

  const getRisk = (level) => RISK_LABELS[level] || RISK_LABELS.low

  //  Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }} aria-hidden="true"></span>
          <p style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '18px' }}>Loading...</p>
        </div>
      </div>
    )
  }

  //  Invalid
  if (status === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
          <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }} aria-hidden="true"></span>
          <h2 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '22px', marginBottom: '12px' }}>Invalid Link</h2>
          <p style={{ color: '#2DD4BF', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>{error}</p>
          <button onClick={() => navigate('/')} style={{ padding: '14px 32px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Go to LossLens â†’</button>
        </div>
      </div>
    )
  }

  //  Declined
  if (status === 'declined') {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }} aria-hidden="true"></span>
          <h2 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '22px', marginBottom: '12px' }}>You've Declined</h2>
          <p style={{ color: '#2DD4BF', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>That's okay. If you change your mind, ask {invitation?.supporter_name || 'your friend'} to send you a new invitation.</p>
          <button onClick={() => navigate('/')} style={{ padding: '14px 32px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Go to LossLens â†’</button>
        </div>
      </div>
    )
  }

  //  Pending
  if (status === 'pending') {
    const permissions = invitation?.permissions || []
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '480px', width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '2.5rem 2rem', border: '2px solid #2DD4BF', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }} aria-hidden="true"></span>
          <h2 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '24px', marginBottom: '8px' }}>{invitation.supporter_name},</h2>
          <p style={{ color: '#7DBDEE', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
            <strong style={{ color: '#2DD4BF' }}>{invitation.anonymous_mode ? 'A loved one' : (userProfile?.full_name || 'Someone')}</strong> has invited you to support their recovery journey on <strong>LossLens</strong>.
          </p>
          <div style={{ background: '#0B1220', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
            <p style={{ color: '#2DD4BF', fontSize: '12px', marginBottom: '10px', fontWeight: 600 }}> What you'll be able to see:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {permissions.map(p => (<span key={p} style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '4px 10px', borderRadius: '100px', fontSize: '11px' }}> {p}</span>))}
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '24px', lineHeight: '1.5' }}> No account needed. Your access is private and secure.</p>
          {actError && <div role="alert" aria-live="polite" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px', color: '#FFFFFF', fontSize: '13px', marginBottom: '16px' }}>{actError}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleDecline} disabled={acting} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{acting ? '...' : 'Decline'}</button>
            <button onClick={handleAccept} disabled={acting} style={{ flex: 2, padding: '14px', borderRadius: '12px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{acting ? 'Processing...' : ' Accept & View Progress'}</button>
          </div>
        </div>
      </div>
    )
  }

  //  Active â€” Supporter Dashboard
  const permissions = invitation?.permissions || []
  const risk = userStats?.riskLevel ? getRisk(userStats.riskLevel) : null

  return (
    <div style={{ minHeight: '100vh', background: '#0B1220' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', padding: '2rem 1.5rem', textAlign: 'center', borderBottom: '2px solid #2DD4BF' }}>
        <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }} aria-hidden="true"></span>
        <h1 style={{ color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '22px', margin: '0 0 4px' }}>
          {invitation.anonymous_mode ? 'Supporting a Loved One' : `Supporting ${userProfile?.full_name || 'Someone'}`}
        </h1>
        <p style={{ color: '#2DD4BF', fontSize: '13px', margin: 0 }}>Here's how they're doing. What you see is what they've chosen to share.</p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Progress Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
          {permissions.includes(PERMISSIONS.STREAK) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} aria-hidden="true"></span>
              <span style={{ display: 'block', fontSize: '28px', fontWeight: 700, color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>{userStats?.streak || 0}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Days gamble-free</span>
            </div>
          )}
          {permissions.includes(PERMISSIONS.STREAK) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} aria-hidden="true"></span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 700, color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>KES {(userStats?.moneySaved || 0).toLocaleString()}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Money saved</span>
            </div>
          )}
          {permissions.includes(PERMISSIONS.GOAL) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} aria-hidden="true"></span>
              <span style={{ display: 'block', fontSize: '16px', fontWeight: 600, color: '#2DD4BF' }}>{userStats?.goal || 'Abstinence'}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Their goal</span>
            </div>
          )}
          {permissions.includes(PERMISSIONS.MODULES) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} aria-hidden="true"></span>
              <span style={{ display: 'block', fontSize: '28px', fontWeight: 700, color: '#2DD4BF', fontFamily: "'Playfair Display', serif" }}>{userStats?.cbtCompleted || 0}/8</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>CBT modules done</span>
            </div>
          )}
          {permissions.includes(PERMISSIONS.RISK) && risk && (
            <div style={{ background: risk.bg, border: `1px solid ${risk.color}33`, borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} aria-hidden="true"></span>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: risk.color }}>{risk.label}</span>
              <span style={{ fontSize: '11px', color: risk.color, opacity: 0.7 }}>Current status</span>
            </div>
          )}
        </div>

        {/* Recent Mood */}
        {permissions.includes(PERMISSIONS.MOOD) && userStats?.recentMoods?.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: 0 }}> Recent Mood</h3>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Past 7 days</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {userStats.recentMoods.slice(0, 7).map((entry, i) => (
                <div key={i} style={{ textAlign: 'center', minWidth: '40px' }}>
                  <span style={{ fontSize: '22px', display: 'block' }} role="img" aria-label={MOOD_LABELS[entry.mood] || 'Unknown mood'}>{getMoodEmoji(entry.mood)}</span>
                  <span style={{ fontSize: '9px', color: entry.gambled ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}>{new Date(entry.date).toLocaleDateString('en-KE', { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '16px', marginBottom: '1rem' }}>
          <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: '0 0 12px' }}> Send Encouragement</h3>
          {messages.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>No messages yet. Be the first to encourage them!</p>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {messages.map(msg => (
                <div key={msg.id} style={{ padding: '10px 14px', borderRadius: msg.sender === 'supporter' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.sender === 'supporter' ? 'rgba(255,255,255,0.12)' : '#0B1220', alignSelf: msg.sender === 'supporter' ? 'flex-end' : 'flex-start', maxWidth: '85%', wordBreak: 'break-word' }}>
                  <p style={{ color: '#7DBDEE', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>{msg.content}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', margin: '4px 0 0' }}>{msg.sender === 'supporter' ? 'You' : 'Them'} Â· {new Date(msg.created_at).toLocaleDateString('en-KE')}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={messageInput}
              onChange={e => setMessageInput(e.target.value.slice(0, 500))}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Write a supportive message..."
              aria-label="Type your message"
              style={{ flex: 1, padding: '10px 14px', borderRadius: '100px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: "'Inter', sans-serif" }}
            />
            <button onClick={sendMessage} disabled={sendingMessage || !messageInput.trim()} style={{ padding: '10px 18px', borderRadius: '100px', background: messageInput.trim() ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: messageInput.trim() ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: messageInput.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              {sendingMessage ? '...' : messageSent ? '' : 'Send '}
            </button>
          </div>
        </div>

        {/* Stop Supporting */}
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <button onClick={() => setShowStopModal(true)} disabled={acting} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', padding: '10px 24px', borderRadius: '100px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            {acting ? 'Processing...' : 'Stop Supporting'}
          </button>
          <p style={{ color: '#7DBDEE', fontSize: '11px', marginTop: '8px' }}> Private & secure Â· No account created Â· You can leave anytime</p>
        </div>
      </div>

      {/* Stop Supporting Modal */}
      {showStopModal && (
        <div onClick={() => setShowStopModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#FFFFFF', fontSize: '16px', margin: '0 0 8px' }}>Stop supporting?</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>You can always ask them for a new invitation link if you change your mind.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowStopModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={handleStopSupporting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Stop</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
