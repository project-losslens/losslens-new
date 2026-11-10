import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createNotification } from '../../lib/notifications'
import AppIcon from '../../components/AppIcon'

//  Constants
const TABS = { ALL: 'all', MINE: 'mine' }
const EXPANDED_TABS = { DISCUSSION: 'discussion', MESSAGE: 'message' }

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;font-weight:500;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function Events() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [rsvps, setRsvps] = useState({})
  const [rsvpLoading, setRsvpLoading] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [eventsError, setEventsError] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [userId, setUserId] = useState(null)
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [discussions, setDiscussions] = useState({})
  const [discussionsLoading, setDiscussionsLoading] = useState({})
  const [questionInputs, setQuestionInputs] = useState({})
  const [submittingQuestion, setSubmittingQuestion] = useState(null)
  const [activeTab, setActiveTab] = useState(TABS.ALL)
  const [attendeeCounts, setAttendeeCounts] = useState({})
  const [showContactForm, setShowContactForm] = useState(null)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [sendingContact, setSendingContact] = useState(false)
  const [contactSent, setContactSent] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [expandedTab, setExpandedTab] = useState({})
  const contactTimer = useRef(null)
  const discussionContainers = useRef({})

  useEffect(() => { fetchEvents(); return () => { if (contactTimer.current) clearTimeout(contactTimer.current) } }, [])

  const fetchEvents = async () => {
    try {
      setPageLoading(true)
      setEventsError(false)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSessionExpired(true); setPageLoading(false); return }
      setUserId(session.user.id)

      const [profileRes, eventsRes, rsvpRes] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', session.user.id).single(),
        supabase.from('events').select('*').eq('active', true).order('date', { ascending: true }).limit(50),
        supabase.from('event_rsvps').select('*')
      ])

      setUserProfile(profileRes.data)
      setEvents(eventsRes.data || [])

      const rsvpMap = {}
      const counts = {}
      ;(rsvpRes.data || []).forEach(r => {
        if (r.user_id === session.user.id) rsvpMap[r.event_id] = { id: r.id, attendance: r.attendance || 'going' }
        if (r.attendance === 'going') counts[r.event_id] = (counts[r.event_id] || 0) + 1
      })
      setRsvps(rsvpMap)
      setAttendeeCounts(counts)
    } catch (err) { console.error('Events fetch error:', err); setEventsError(true) }
    finally { setPageLoading(false) }
  }

  //  Lazy-load discussions per event
  const loadDiscussions = async (eventId) => {
    if (discussions[eventId]) return
    setDiscussionsLoading(prev => ({ ...prev, [eventId]: true }))
    try {
      const { data } = await supabase.from('event_discussions').select('*, profiles(full_name)').eq('event_id', eventId).order('created_at', { ascending: true }).limit(50)
      setDiscussions(prev => ({ ...prev, [eventId]: data || [] }))
    } catch (err) { console.error('Discussions fetch error:', err) }
    finally { setDiscussionsLoading(prev => ({ ...prev, [eventId]: false })) }
  }

  //  Optimistic RSVP with error handling
  const handleRSVP = async (eventId, attendance) => {
    if (!userId) return

    // Optimistic update
    const prevRsvps = { ...rsvps }
    const prevCounts = { ...attendeeCounts }
    const oldAttendance = rsvps[eventId]?.attendance

    if (attendance === 'cant_go') {
      // Optimistic remove
      if (rsvps[eventId]) {
        setRsvps(prev => { const next = { ...prev }; delete next[eventId]; return next })
        if (oldAttendance === 'going') setAttendeeCounts(prev => ({ ...prev, [eventId]: Math.max(0, (prev[eventId] || 1) - 1) }))
      }
    } else if (rsvps[eventId]) {
      setRsvps(prev => ({ ...prev, [eventId]: { ...prev[eventId], attendance } }))
      if (oldAttendance !== 'going' && attendance === 'going') setAttendeeCounts(prev => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }))
      else if (oldAttendance === 'going' && attendance !== 'going') setAttendeeCounts(prev => ({ ...prev, [eventId]: Math.max(0, (prev[eventId] || 1) - 1) }))
    } else {
      const tempId = `temp-${Date.now()}`
      setRsvps(prev => ({ ...prev, [eventId]: { id: tempId, attendance } }))
      if (attendance === 'going') setAttendeeCounts(prev => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }))
    }

    setRsvpLoading(eventId)
    try {
      if (attendance === 'cant_go' && rsvps[eventId]) {
        const { error } = await supabase.from('event_rsvps').delete().eq('user_id', userId).eq('event_id', eventId)
        if (error) throw error
        showToast('RSVP removed', 2000)
      } else if (rsvps[eventId]) {
        const { error } = await supabase.from('event_rsvps').update({ attendance }).eq('user_id', userId).eq('event_id', eventId)
        if (error) throw error
        showToast(attendance === 'going' ? ' Confirmed!' : ' Marked as maybe', 2000)
      } else {
        const { data, error } = await supabase.from('event_rsvps').insert({ user_id: userId, event_id: eventId, attendance }).select().single()
        if (error || !data) throw error || new Error('Insert failed')
        setRsvps(prev => ({ ...prev, [eventId]: { id: data.id, attendance } }))
        showToast(attendance === 'going' ? ' Confirmed!' : ' Marked as maybe', 2000)
      }
    } catch (err) {
      // Rollback on failure
      setRsvps(prevRsvps)
      setAttendeeCounts(prevCounts)
      showToast('Failed to save. Try again.', 2000)
    } finally { setRsvpLoading(null) }
  }

  const handleAskQuestion = async (eventId) => {
    const content = (questionInputs[eventId] || '').trim()
    if (!content || !userId) return
    setSubmittingQuestion(eventId)
    const tempId = `temp-disc-${Date.now()}`
    setDiscussions(prev => ({ ...prev, [eventId]: [...(prev[eventId] || []), { id: tempId, event_id: eventId, user_id: userId, message: content, created_at: new Date().toISOString(), profiles: { full_name: userProfile?.full_name || 'You' } }] }))
    setQuestionInputs(prev => ({ ...prev, [eventId]: '' }))
    try {
      const { data, error } = await supabase.from('event_discussions').insert({ event_id: eventId, user_id: userId, message: content }).select('*, profiles(full_name)').single()
      if (error || !data) throw error
      setDiscussions(prev => ({ ...prev, [eventId]: prev[eventId].map(m => m.id === tempId ? data : m) }))
      // Auto-scroll
      setTimeout(() => { if (discussionContainers.current[eventId]) discussionContainers.current[eventId].scrollTop = discussionContainers.current[eventId].scrollHeight }, 100)
    } catch (err) {
      setDiscussions(prev => ({ ...prev, [eventId]: prev[eventId].filter(m => m.id !== tempId) }))
      showToast('Failed to post. Try again.', 2000)
    } finally { setSubmittingQuestion(null) }
  }

  const handleContactAdmin = async (eventId) => {
    if (!contactMessage.trim()) { showToast('Enter a message', 2000); return }
    setSendingContact(true)
    try {
      const { error } = await supabase.from('event_messages').insert({
        event_id: eventId, user_id: userId,
        name: contactName || userProfile?.full_name || '',
        phone: contactPhone || userProfile?.phone || '',
        email: contactEmail || '',
        message: contactMessage.trim(),
      })
      if (error) throw error
      setContactSent(true)
      showToast(' Message sent!', 3000)
      try { await createNotification(userId, { title: ' Message Sent', message: 'Admin will reply soon.', type: 'success', icon: '', link: '/events' }) } catch {}
      contactTimer.current = setTimeout(() => { setShowContactForm(null); setContactSent(false); setContactName(''); setContactPhone(''); setContactEmail(''); setContactMessage('') }, 2000)
    } catch (err) { showToast('Failed to send.', 2000) }
    finally { setSendingContact(false) }
  }

  //  Close contact form on Escape
  useEffect(() => {
    if (!showContactForm) return
    const handleEsc = (e) => { if (e.key === 'Escape') setShowContactForm(null) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showContactForm])

  const formatDate = (d) => { try { return new Date(d).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d } }

  const getDaysUntil = (d) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const ed = new Date(d); ed.setHours(0, 0, 0, 0)
    const diff = Math.ceil((ed - today) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff < 0) return 'Past'
    return `${diff} days away`
  }

  const filteredEvents = useMemo(() => activeTab === TABS.MINE ? events.filter(e => rsvps[e.id]) : events, [events, rsvps, activeTab])

  //  Auth gate
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

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0 }} className="page-content">

        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> Events</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{events.length} events  · {Object.keys(rsvps).length} responded</p>
          </div>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <button onClick={() => setActiveTab(TABS.ALL)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === TABS.ALL ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === TABS.ALL ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: activeTab === TABS.ALL ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> All Events</button>
            <button onClick={() => setActiveTab(TABS.MINE)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === TABS.MINE ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === TABS.MINE ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: activeTab === TABS.MINE ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> My Events ({Object.keys(rsvps).length})</button>
          </div>

          {pageLoading && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <span className="spinner" style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.12)', borderTopColor: '#2DD4BF', display: 'inline-block' }} />
            </div>
          )}

          {!pageLoading && eventsError && (
            <div className="dash-section" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', marginBottom: '12px' }}>Could not load events.</p>
              <button type="button" className="btn-primary" onClick={fetchEvents}>Try again</button>
            </div>
          )}

          {!pageLoading && !eventsError && filteredEvents.length === 0 && (
            <div className="dash-section" style={{ textAlign: 'center', padding: '3rem' }}>
              <AppIcon name="calendar" size={48} style={{ display: 'block', margin: '0 auto 12px', color: '#2DD4BF' }} />
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>
                {activeTab === TABS.MINE ? 'You have not responded to any events yet.' : 'No upcoming events.'}
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {filteredEvents.map(e => {
              const myRsvp = rsvps[e.id]
              const isExpanded = expandedEvent === e.id
              const eventDiscussions = discussions[e.id] || []
              const goingCount = attendeeCounts[e.id] || 0
              const daysUntil = getDaysUntil(e.date)
              const currentTab = expandedTab[e.id] || EXPANDED_TABS.DISCUSSION
              const discussionOn = e.discussion_enabled !== false
              const isPast = daysUntil === 'Past'

              return (
                <div key={e.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${myRsvp ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`, borderRadius: '14px', overflow: 'hidden', animation: 'fadeIn 0.3s ease-out', opacity: isPast ? 0.7 : 1 }}>

                  <div style={{ width: '100%', height: '170px', background: e.image_url ? `url(${e.image_url}) center/cover` : 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px', position: 'relative' }}>
                    {!e.image_url && <AppIcon name="calendar" size={48} style={{ opacity: 0.3, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#FFFFFF' }} />}
                    <span style={{ background: 'rgba(255,255,255,0.9)', padding: '4px 12px', borderRadius: '100px', fontSize: '11px', color: '#2DD4BF', position: 'relative', zIndex: 'var(--z-base)' }}>{e.type || 'Event'}</span>
                    <span style={{ background: 'rgba(255,255,255,0.9)', padding: '4px 12px', borderRadius: '100px', fontSize: '11px', color: daysUntil === 'Today' ? '#FFFFFF' : isPast ? 'rgba(255,255,255,0.4)' : '#2DD4BF', position: 'relative', zIndex: 'var(--z-base)' }}>{daysUntil}</span>
                  </div>

                  <div style={{ padding: '16px' }}>
                    <h3 style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}><button type="button" className="clickable" style={{ font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }} onClick={() => {
                      if (expandedEvent === e.id) setExpandedEvent(null)
                      else { setExpandedEvent(e.id); loadDiscussions(e.id) }
                    }}>{e.title}</button></h3>

                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
                      <span> {formatDate(e.date)}</span>
                      {e.time && <span> {e.time}</span>}
                      {e.location && <span> {e.location}</span>}
                      <span> {goingCount} attending{e.spots ? `  · ${e.spots} spots` : ''}</span>
                    </div>

                    {/*  RSVP Buttons — disabled for past events */}
                    {!isPast && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {!myRsvp ? (
                          <>
                            <button onClick={() => handleRSVP(e.id, 'going')} disabled={rsvpLoading === e.id} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #2DD4BF', background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: rsvpLoading === e.id ? 0.6 : 1 }} aria-pressed={false}>{rsvpLoading === e.id ? '...' : " I'm going"}</button>
                            <button onClick={() => handleRSVP(e.id, 'maybe')} disabled={rsvpLoading === e.id} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #7DBDEE', background: 'transparent', color: '#7DBDEE', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: rsvpLoading === e.id ? 0.6 : 1 }} aria-pressed={false}>{rsvpLoading === e.id ? '...' : ' Maybe'}</button>
                            <button onClick={() => handleRSVP(e.id, 'cant_go')} disabled={rsvpLoading === e.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: rsvpLoading === e.id ? 0.6 : 1 }} aria-label="Remove RSVP">{rsvpLoading === e.id ? '...' : ''}</button>
                          </>
                        ) : myRsvp.attendance === 'going' ? (
                          <>
                            <button onClick={() => handleRSVP(e.id, 'maybe')} disabled={rsvpLoading === e.id} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: '2px solid #2DD4BF', background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-pressed={true}> Going</button>
                            <button onClick={() => handleRSVP(e.id, 'cant_go')} disabled={rsvpLoading === e.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-label="Cancel RSVP"></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleRSVP(e.id, 'going')} disabled={rsvpLoading === e.id} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: '2px solid #7DBDEE', background: 'rgba(255,255,255,0.12)', color: '#7DBDEE', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-pressed={true}> Maybe</button>
                            <button onClick={() => handleRSVP(e.id, 'cant_go')} disabled={rsvpLoading === e.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-label="Cancel RSVP"></button>
                          </>
                        )}
                        <button onClick={() => {
                          if (expandedEvent === e.id) setExpandedEvent(null)
                          else { setExpandedEvent(e.id); loadDiscussions(e.id) }
                        }} style={{ padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '14px', cursor: 'pointer' }} aria-expanded={isExpanded}>{isExpanded ? '▲' : '▼'}</button>
                      </div>
                    )}
                    {isPast && (
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', marginBottom: '10px' }}>This event has passed</p>
                    )}

                    {rsvpLoading === e.id && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '8px' }}>Saving...</p>}

                    {isExpanded && (
                      <div style={{ animation: 'fadeIn 0.3s ease-out', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: '14px' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                          {[{ label: ' Going', count: attendeeCounts[e.id] || 0, color: '#2DD4BF' }, { label: ' Discussion', count: discussionOn ? eventDiscussions.length : '', color: discussionOn ? '#2DD4BF' : '#FFFFFF' }].map((s, i) => (
                            <div key={i} style={{ flex: 1, background: '#0B1220', borderRadius: '8px', padding: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.12)' }}>
                              <div style={{ fontSize: '16px', fontWeight: 700, color: s.color, fontFamily: 'Georgia, serif' }}>{s.count}</div>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {e.description && <p style={{ color: '#7DBDEE', fontSize: '13px', lineHeight: '1.6', marginBottom: '16px', fontWeight: 300 }}>{e.description}</p>}

                        <div style={{ display: 'flex', background: '#0B1220', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: '12px' }}>
                          <button onClick={() => setExpandedTab(prev => ({ ...prev, [e.id]: EXPANDED_TABS.DISCUSSION }))} style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: currentTab === EXPANDED_TABS.DISCUSSION ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', background: currentTab === EXPANDED_TABS.DISCUSSION ? 'rgba(255,255,255,0.12)' : 'transparent', color: currentTab === EXPANDED_TABS.DISCUSSION ? '#2DD4BF' : 'rgba(255,255,255,0.4)' }}> Discussion ({eventDiscussions.length})</button>
                          <button onClick={() => setExpandedTab(prev => ({ ...prev, [e.id]: EXPANDED_TABS.MESSAGE }))} style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: currentTab === EXPANDED_TABS.MESSAGE ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', background: currentTab === EXPANDED_TABS.MESSAGE ? 'rgba(255,255,255,0.12)' : 'transparent', color: currentTab === EXPANDED_TABS.MESSAGE ? '#2DD4BF' : 'rgba(255,255,255,0.4)' }}> Message Admin</button>
                        </div>

                        {currentTab === EXPANDED_TABS.DISCUSSION && (
                          <div>
                            {!discussionOn ? (
                              <div style={{ textAlign: 'center', padding: '1.5rem', background: '#0B1220', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                                <p style={{ fontSize: '20px', marginBottom: '6px' }}></p>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>Discussion is closed for this event.</p>
                              </div>
                            ) : discussionsLoading[e.id] ? (
                              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', padding: '1rem' }}>Loading...</p>
                            ) : (
                              <>
                                {eventDiscussions.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '10px' }}>No messages yet. Be the first!</p>}
                                <div ref={el => discussionContainers.current[e.id] = el} style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {eventDiscussions.map(d => (
                                    <div key={d.id} style={{ padding: '10px', background: '#0B1220', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ color: '#2DD4BF', fontSize: '11px', fontWeight: 500 }}>{d.profiles?.full_name || 'Anonymous'}{d.is_admin_reply && <span style={{ color: '#2DD4BF', marginLeft: '6px', fontSize: '10px' }}>ADMIN</span>}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{new Date(d.created_at).toLocaleDateString('en-KE')}</span>
                                      </div>
                                      <p style={{ color: '#7DBDEE', fontSize: '12px', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{d.message}</p>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input value={questionInputs[e.id] || ''} onChange={ev => setQuestionInputs(prev => ({ ...prev, [e.id]: ev.target.value }))} placeholder="Write a message..." style={{ flex: 1, padding: '8px 12px', borderRadius: '100px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)' }} onKeyDown={ev => ev.key === 'Enter' && handleAskQuestion(e.id)} aria-label="Write a discussion message" />
                                  <button onClick={() => handleAskQuestion(e.id)} disabled={!questionInputs[e.id]?.trim() || submittingQuestion === e.id} style={{ padding: '8px 14px', borderRadius: '100px', background: questionInputs[e.id]?.trim() ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: questionInputs[e.id]?.trim() ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: questionInputs[e.id]?.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{submittingQuestion === e.id ? '...' : 'Send'}</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {currentTab === EXPANDED_TABS.MESSAGE && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>Send a private message to the admin about this event.</p>
                            <div><label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Your Name</label><input type="text" value={contactName} onChange={ev => setContactName(ev.target.value)} placeholder={userProfile?.full_name || 'Full name'} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
                            <div><label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Phone</label><input type="tel" value={contactPhone} onChange={ev => setContactPhone(ev.target.value)} placeholder={userProfile?.phone || '+254 7XX XXX XXX'} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
                            <div><label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Email (optional)</label><input type="email" value={contactEmail} onChange={ev => setContactEmail(ev.target.value)} placeholder="you@example.com" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
                            <div><label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Message *</label><textarea value={contactMessage} onChange={ev => setContactMessage(ev.target.value)} rows={3} placeholder="What would you like to ask?" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box' }} /></div>
                            <button onClick={() => handleContactAdmin(e.id)} disabled={sendingContact || !contactMessage.trim()} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: contactMessage.trim() ? '#2DD4BF' : 'rgba(255,255,255,0.12)', border: 'none', color: contactMessage.trim() ? '#0B1220' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: 600, cursor: contactMessage.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>{sendingContact ? 'Sending...' : ' Send to Admin'}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
