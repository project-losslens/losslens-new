import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

// ✅ Constants
const EVENT_TYPES = ['Workshop', 'Support Group', 'Seminar', 'Webinar', 'Social Event', 'Training', 'Other']
const TABS = { EVENTS: 'events', RSVPS: 'rsvps', DISCUSSIONS: 'discussions', CONTACTS: 'contacts' }

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

export default function ManageEvents() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])
  const [rsvps, setRsvps] = useState({})
  const [contacts, setContacts] = useState([])
  const [discussions, setDiscussions] = useState([])
  const [activeTab, setActiveTab] = useState(TABS.EVENTS)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [replyInputs, setReplyInputs] = useState({})
  const [sendingReply, setSendingReply] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState(null)
  const [togglingDiscussion, setTogglingDiscussion] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    title: '', description: '', date: '', location: '',
    type: 'Workshop', spots: '', image_url: '', active: true, discussion_enabled: true
  })

  const displayToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        eventsRes, rsvpRes, contactRes, discussionRes,
      ] = await Promise.all([
        supabase.from('events').select('*').order('date', { ascending: false }),
        supabase.from('event_rsvps').select('event_id, attendance, user_id, profiles(full_name, email, phone, username)'),
        supabase.from('event_messages').select('*, events(title)').order('created_at', { ascending: false }).limit(50),
        supabase.from('event_discussions').select('*, events(title), profiles(full_name, username)').order('created_at', { ascending: false }).limit(100),
      ])

      // Group RSVPs by event
      const grouped = {}
      ;(rsvpRes.data || []).forEach(r => {
        if (!grouped[r.event_id]) grouped[r.event_id] = { going: [], maybe: [], cant: [] }
        if (r.attendance === 'going') grouped[r.event_id].going.push({ ...r.profiles, user_id: r.user_id })
        else if (r.attendance === 'maybe') grouped[r.event_id].maybe.push({ ...r.profiles, user_id: r.user_id })
        else grouped[r.event_id].cant.push({ ...r.profiles, user_id: r.user_id })
      })

      setEvents(eventsRes.data || [])
      setRsvps(grouped)
      setContacts(contactRes.data || [])
      setDiscussions(discussionRes.data || [])
    } catch (err) {
      console.error('Events fetch error:', err)
      setError('Failed to load events.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openCreate = () => {
    setEditingEvent(null)
    setForm({ title: '', description: '', date: '', location: '', type: 'Workshop', spots: '', image_url: '', active: true, discussion_enabled: true })
    setFormErrors({})
    setShowForm(true)
  }

  const openEdit = (ev) => {
    setEditingEvent(ev)
    setForm({
      title: ev.title, description: ev.description || '',
      date: ev.date?.slice(0, 16) || '', location: ev.location || '',
      type: ev.type || 'Workshop', spots: ev.spots || '',
      image_url: ev.image_url || '', active: ev.active,
      discussion_enabled: ev.discussion_enabled !== false,
    })
    setFormErrors({})
    setShowForm(true)
  }

  // ✅ Validate form
  const validateForm = () => {
    const errors = {}
    if (!form.title.trim()) errors.title = 'Title is required'
    if (!form.date) errors.date = 'Date is required'
    if (form.spots && (isNaN(parseInt(form.spots)) || parseInt(form.spots) < 1)) errors.spots = 'Enter a valid number (min 1)'
    if (form.image_url && !/^https?:\/\/.+/.test(form.image_url)) errors.image_url = 'Enter a valid URL'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveEvent = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = { ...form, spots: form.spots ? parseInt(form.spots) : null }
      const { error: saveError } = editingEvent
        ? await supabase.from('events').update(payload).eq('id', editingEvent.id)
        : await supabase.from('events').insert(payload)
      if (saveError) throw saveError
      displayToast(editingEvent ? 'Event updated!' : 'Event created!')
      setShowForm(false)
      fetchAll()
    } catch (err) { displayToast('Save failed: ' + err.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleActive = async (ev) => {
    const newActive = !ev.active
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, active: newActive } : e))
    const { error: toggleError } = await supabase.from('events').update({ active: newActive }).eq('id', ev.id)
    if (toggleError) {
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, active: !newActive } : e))
      displayToast('Update failed.', 'error')
    } else {
      displayToast(newActive ? 'Event activated.' : 'Event deactivated.')
    }
  }

  const toggleDiscussion = async (ev) => {
    setTogglingDiscussion(ev.id)
    const newVal = ev.discussion_enabled === false ? true : false
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, discussion_enabled: newVal } : e))
    const { error } = await supabase.from('events').update({ discussion_enabled: newVal }).eq('id', ev.id)
    if (error) {
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, discussion_enabled: !newVal } : e))
      displayToast('Failed to update.', 'error')
    } else {
      displayToast(newVal ? '💬 Discussion enabled.' : '🔒 Discussion disabled.')
    }
    setTogglingDiscussion(null)
  }

  // ✅ Cascade delete RSVPs + discussions + messages
  const deleteEvent = async (id) => {
    setDeleting(true)
    try {
      // Delete related records first
      await Promise.all([
        supabase.from('event_rsvps').delete().eq('event_id', id),
        supabase.from('event_discussions').delete().eq('event_id', id),
        supabase.from('event_messages').delete().eq('event_id', id),
      ])
      const { error: delError } = await supabase.from('events').delete().eq('id', id)
      if (delError) throw delError
      setEvents(prev => prev.filter(e => e.id !== id))
      displayToast('Event deleted.')
    } catch (err) { displayToast('Delete failed: ' + err.message, 'error') }
    setDeleting(false)
    setShowDeleteConfirm(null)
    setExpandedEvent(null)
  }

  const handleAdminReply = async (eventId, discussionId) => {
    const reply = replyInputs[discussionId]?.trim()
    if (!reply) return
    setSendingReply(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error: replyError } = await supabase.from('event_discussions').insert({
        event_id: eventId,
        user_id: session?.user?.id || null,
        message: reply,
        is_admin_reply: true,
      })
      if (replyError) throw replyError
      displayToast('Reply posted!')
      setReplyInputs(prev => ({ ...prev, [discussionId]: '' }))
      fetchAll()
    } catch (err) { displayToast('Failed to reply.', 'error') }
    setSendingReply(false)
  }

  const deleteDiscussion = async (id) => {
    const { error: delError } = await supabase.from('event_discussions').delete().eq('id', id)
    if (delError) { displayToast('Delete failed.', 'error') }
    else { setDiscussions(prev => prev.filter(d => d.id !== id)); displayToast('Message deleted.') }
  }

  const deleteContact = async (id) => {
    const { error: delError } = await supabase.from('event_messages').delete().eq('id', id)
    if (delError) { displayToast('Delete failed.', 'error') }
    else { setContacts(prev => prev.filter(c => c.id !== id)); displayToast('Message deleted.') }
  }

  const markContactRead = async (id) => {
    const { error: readError } = await supabase.from('event_messages').update({ read: true }).eq('id', id)
    if (!readError) setContacts(prev => prev.map(c => c.id === id ? { ...c, read: true } : c))
  }

  const filteredEvents = useMemo(() => events.filter(e =>
    !searchQuery || e.title?.toLowerCase().includes(searchQuery.toLowerCase()) || (e.location || '').toLowerCase().includes(searchQuery.toLowerCase())
  ), [events, searchQuery])

  const unreadContacts = useMemo(() => contacts.filter(c => !c.read).length, [contacts])

  // ✅ RSVP events with data
  const rsvpEvents = useMemo(() => events.filter(ev => {
    const r = rsvps[ev.id]
    return r && (r.going.length + r.maybe.length + r.cant.length) > 0
  }), [events, rsvps])

  const badge = (color, bg, border) => ({
    background: bg, color, border: `1px solid ${border}`,
    padding: '2px 8px', borderRadius: '100px', fontSize: '10px', whiteSpace: 'nowrap',
  })
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#e2f5ec', fontSize: '13px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#FAC775', fontSize: '13px' }}>Loading events...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#F09595', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchAll} style={btnStyle('transparent', '#F09595', '#F09595')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">

        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#041f13', borderBottom: '2px solid #791F1F', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#F09595', fontFamily: "'Inter', sans-serif", margin: 0 }}>📅 Manage Events</h1>
            <p style={{ fontSize: '12px', color: '#791F1F', margin: '2px 0 0' }}>{events.length} events · {contacts.length} messages{unreadContacts > 0 ? ` · ${unreadContacts} unread` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>🔄 Refresh</button>
            <button onClick={() => navigate('/admin')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>← Back</button>
          </div>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#791F1F' : '#1d5c38', color: toast.type === 'error' ? '#F09595' : '#6ee7b7', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #0a3d22', maxWidth: '540px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ color: '#f59e0b', fontSize: '16px', margin: '0 0 1.25rem' }}>{editingEvent ? '✏️ Edit Event' : '➕ New Event'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Title *</label>
                  <input type="text" value={form.title} onChange={e => { setForm(p => ({ ...p, title: e.target.value })); setFormErrors(p => ({ ...p, title: '' })) }} style={{ ...inputStyle, borderColor: formErrors.title ? '#F09595' : '#0a3d22' }} placeholder="e.g. Weekly Support Group" />
                  {formErrors.title && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.title}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Date & Time *</label>
                    <input type="datetime-local" value={form.date} onChange={e => { setForm(p => ({ ...p, date: e.target.value })); setFormErrors(p => ({ ...p, date: '' })) }} style={{ ...inputStyle, borderColor: formErrors.date ? '#F09595' : '#0a3d22' }} />
                    {formErrors.date && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.date}</span>}
                  </div>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Type</label>
                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Location</label>
                    <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={inputStyle} placeholder="e.g. Nairobi CBD" />
                  </div>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Spots (min 1)</label>
                    <input type="number" value={form.spots} onChange={e => { setForm(p => ({ ...p, spots: e.target.value })); setFormErrors(p => ({ ...p, spots: '' })) }} style={{ ...inputStyle, borderColor: formErrors.spots ? '#F09595' : '#0a3d22' }} placeholder="e.g. 50" min="1" />
                    {formErrors.spots && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.spots}</span>}
                  </div>
                </div>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Image URL</label>
                  <input type="text" value={form.image_url} onChange={e => { setForm(p => ({ ...p, image_url: e.target.value })); setFormErrors(p => ({ ...p, image_url: '' })) }} style={{ ...inputStyle, borderColor: formErrors.image_url ? '#F09595' : '#0a3d22' }} placeholder="https://..." />
                  {formErrors.image_url && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.image_url}</span>}
                </div>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }} />
                    <span style={{ color: '#3b7a5a', fontSize: '11px' }}>Active (visible to users)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.discussion_enabled} onChange={e => setForm(p => ({ ...p, discussion_enabled: e.target.checked }))} style={{ accentColor: '#6ee7b7', width: '16px', height: '16px' }} />
                    <span style={{ color: '#3b7a5a', fontSize: '11px' }}>Discussion enabled</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowForm(false)} style={btnStyle('transparent', '#3b7a5a', '#0a3d22')}>Cancel</button>
                  <button onClick={saveEvent} disabled={saving} style={btnStyle('#f59e0b', '#041f13', '#f59e0b')}>{saving ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #791F1F', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>🗑️</span>
              <h3 style={{ color: '#F09595', fontSize: '16px', margin: '0 0 8px' }}>Delete Event?</h3>
              <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
                Permanently delete <strong style={{ color: '#f59e0b' }}>"{showDeleteConfirm.title}"</strong> and ALL its RSVPs, discussions, and messages? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
                <button onClick={() => deleteEvent(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#791F1F', border: 'none', color: '#F09595', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{deleting ? 'Deleting...' : 'Delete All'}</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: '#062616', borderRadius: '12px', padding: '4px', border: '1px solid #0a3d22', overflowX: 'auto' }}>
            {[
              { id: TABS.EVENTS, label: `📅 Events (${events.length})` },
              { id: TABS.RSVPS, label: `✅ RSVPs (${rsvpEvents.length})` },
              { id: TABS.DISCUSSIONS, label: `💬 Discussions (${discussions.length})` },
              { id: TABS.CONTACTS, label: `📩 Messages (${contacts.length})${unreadContacts > 0 ? ' 🔴' : ''}` },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? '#633806' : 'transparent', color: activeTab === tab.id ? '#f59e0b' : '#3b7a5a', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minWidth: '100px', transition: 'background 0.2s, color 0.2s' }}>{tab.label}</button>
            ))}
          </div>

          {/* EVENTS TAB */}
          {activeTab === TABS.EVENTS && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="🔍 Search events..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, width: '260px', borderRadius: '100px', paddingRight: '32px' }} />
                  {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#3b7a5a', cursor: 'pointer', fontSize: '14px', padding: '4px 6px' }}>✕</button>}
                </div>
                <button onClick={openCreate} style={btnStyle('#f59e0b', '#041f13', '#f59e0b')}>➕ New Event</button>
              </div>

              {filteredEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📅</span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>{searchQuery ? 'No events match your search.' : 'No events yet.'}</p>
                  {searchQuery && <button onClick={() => setSearchQuery('')} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid #6ee7b7', color: '#6ee7b7', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Clear search</button>}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredEvents.map(ev => {
                    const r = rsvps[ev.id] || { going: [], maybe: [], cant: [] }
                    const isExpanded = expandedEvent === ev.id
                    const discussionOn = ev.discussion_enabled !== false
                    const totalRSVPs = r.going.length + r.maybe.length + r.cant.length
                    return (
                      <div key={ev.id} style={{ background: '#062616', border: `1px solid ${isExpanded ? '#f59e0b' : '#0a3d22'}`, borderRadius: '12px', padding: '16px', transition: 'border-color 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                              <span style={{ color: '#e2f5ec', fontSize: '14px', fontWeight: 600 }}>{ev.title}</span>
                              <span style={badge(ev.active ? '#6ee7b7' : '#3b7a5a', ev.active ? '#0a3d22' : '#062616', ev.active ? '#6ee7b7' : '#3b7a5a')}>{ev.active ? 'Active' : 'Inactive'}</span>
                              {ev.type && <span style={badge('#FAC775', '#633806', '#FAC775')}>{ev.type}</span>}
                              <span style={badge(discussionOn ? '#6ee7b7' : '#F09595', discussionOn ? '#041f13' : '#1a0a0a', discussionOn ? '#6ee7b7' : '#F09595')}>{discussionOn ? '💬 Chat' : '🔒 Chat off'}</span>
                            </div>
                            <p style={{ color: '#3b7a5a', fontSize: '11px', margin: '0 0 4px' }}>📍 {ev.location || 'No location'} · 🗓️ {fmtTime(ev.date)}{ev.spots ? ` · 👥 ${ev.spots} spots` : ''}</p>
                            {ev.description && <p style={{ color: '#3b7a5a', fontSize: '12px', margin: '4px 0 0', lineHeight: '1.5' }}>{isExpanded ? ev.description : ev.description.substring(0, 120)}{!isExpanded && ev.description.length > 120 ? '…' : ''}</p>}
                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
                              <span style={{ color: '#6ee7b7', fontSize: '12px' }}>✅ {r.going.length} Going</span>
                              <span style={{ color: '#FAC775', fontSize: '12px' }}>🤔 {r.maybe.length} Maybe</span>
                              <span style={{ color: '#F09595', fontSize: '12px' }}>❌ {r.cant.length} Can't</span>
                              {ev.spots && <span style={{ color: totalRSVPs >= ev.spots ? '#F09595' : '#3b7a5a', fontSize: '12px' }}>{totalRSVPs}/{ev.spots} spots</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <button onClick={() => setExpandedEvent(isExpanded ? null : ev.id)} style={btnStyle('transparent', '#6ee7b7', '#0a3d22')}>{isExpanded ? '▲' : '▼'}</button>
                            <button onClick={() => openEdit(ev)} style={btnStyle('transparent', '#FAC775', '#FAC775')}>✏️</button>
                            <button onClick={() => toggleActive(ev)} style={btnStyle('transparent', ev.active ? '#FAC775' : '#6ee7b7', ev.active ? '#FAC775' : '#6ee7b7')}>{ev.active ? 'Hide' : 'Show'}</button>
                            <button onClick={() => toggleDiscussion(ev)} disabled={togglingDiscussion === ev.id} style={btnStyle(discussionOn ? '#0a3d22' : '#1a0a0a', discussionOn ? '#6ee7b7' : '#F09595', discussionOn ? '#6ee7b7' : '#F09595')}>{togglingDiscussion === ev.id ? '...' : discussionOn ? '🔒' : '💬'}</button>
                            <button onClick={() => setShowDeleteConfirm(ev)} style={btnStyle('transparent', '#F09595', '#791F1F')}>🗑️</button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: '16px', borderTop: '1px solid #0a3d22', paddingTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            {[{ label: '✅ Going', list: r.going, color: '#6ee7b7' }, { label: '🤔 Maybe', list: r.maybe, color: '#FAC775' }, { label: "❌ Can't", list: r.cant, color: '#F09595' }].map(({ label, list, color }) => (
                              <div key={label}>
                                <p style={{ color, fontSize: '12px', fontWeight: 600, margin: '0 0 6px' }}>{label} ({list.length})</p>
                                {list.length === 0 ? <p style={{ color: '#3b7a5a', fontSize: '11px' }}>None</p> : list.map((u, i) => (
                                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #0a3d22' }}>
                                    <p style={{ color: '#e2f5ec', fontSize: '12px', margin: 0 }}>{u.full_name || u.username || 'Attendee'}</p>
                                    {u.email && <p style={{ color: '#3b7a5a', fontSize: '10px', margin: '2px 0 0' }}>{u.email}</p>}
                                    {u.phone && <p style={{ color: '#6ee7b7', fontSize: '10px' }}>📞 {u.phone}</p>}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* RSVPs TAB */}
          {activeTab === TABS.RSVPS && (
            <div>
              {rsvpEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>✅</span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No RSVPs yet.</p>
                </div>
              ) : rsvpEvents.map(ev => {
                const r = rsvps[ev.id]
                return (
                  <div key={ev.id} style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 600, margin: 0 }}>{ev.title}</p>
                      <button onClick={() => {
                        // ✅ Export RSVPs as CSV
                        const headers = 'Name,Email,Phone,Status\n'
                        const rows = [
                          ...r.going.map(u => `"${u.full_name || ''}","${u.email || ''}","${u.phone || ''}","Going"`),
                          ...r.maybe.map(u => `"${u.full_name || ''}","${u.email || ''}","${u.phone || ''}","Maybe"`),
                          ...r.cant.map(u => `"${u.full_name || ''}","${u.email || ''}","${u.phone || ''}","Can't"`),
                        ].join('\n')
                        const blob = new Blob([headers + rows], { type: 'text/csv' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `rsvp-${ev.title?.replace(/\s/g,'-') || 'event'}.csv`
                        a.click(); URL.revokeObjectURL(url)
                        displayToast('📥 RSVP list downloaded!')
                      }} style={btnStyle('transparent', '#6ee7b7', '#6ee7b7')}>📥 Export CSV</button>
                    </div>
                    {[{ label: '✅ Going', list: r.going, color: '#6ee7b7' }, { label: '🤔 Maybe', list: r.maybe, color: '#FAC775' }, { label: "❌ Can't", list: r.cant, color: '#F09595' }].map(({ label, list, color }) => list.length > 0 && (
                      <div key={label} style={{ marginBottom: '10px' }}>
                        <p style={{ color, fontSize: '12px', fontWeight: 600, margin: '0 0 6px' }}>{label} ({list.length})</p>
                        {list.map((u, i) => (
                          <div key={i} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: '1px solid #0a3d22', flexWrap: 'wrap' }}>
                            <span style={{ color: '#e2f5ec', fontSize: '13px' }}>{u.full_name || u.username || 'Attendee'}</span>
                            {u.email && <span style={{ color: '#3b7a5a', fontSize: '11px' }}>{u.email}</span>}
                            {u.phone && <span style={{ color: '#6ee7b7', fontSize: '11px' }}>📞 {u.phone}</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* DISCUSSIONS TAB */}
          {activeTab === TABS.DISCUSSIONS && (
            <div>
              {discussions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>💬</span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No discussions yet.</p>
                </div>
              ) : discussions.map((d, i) => (
                <div key={i} style={{ background: '#062616', border: `1px solid ${d.is_admin_reply ? '#633806' : '#0a3d22'}`, borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500 }}>{d.profiles?.full_name || d.profiles?.username || 'Anonymous'}</span>
                      {d.is_admin_reply && <span style={badge('#f59e0b', '#633806', '#f59e0b')}>ADMIN</span>}
                    </div>
                    <span style={{ color: '#3b7a5a', fontSize: '11px' }}>{fmtTime(d.created_at)}</span>
                  </div>
                  {d.events?.title && <p style={{ color: '#f59e0b', fontSize: '11px', margin: '0 0 6px' }}>Re: {d.events.title}</p>}
                  <p style={{ color: '#9fe1cb', fontSize: '12px', margin: '0 0 10px', lineHeight: '1.5' }}>{d.message}</p>
                  {!d.is_admin_reply && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input value={replyInputs[d.id] || ''} onChange={e => setReplyInputs(prev => ({ ...prev, [d.id]: e.target.value }))} placeholder="Reply as admin..." style={{ ...inputStyle, flex: 1, minWidth: '150px', borderRadius: '100px', padding: '6px 12px', fontSize: '11px' }} onKeyDown={e => e.key === 'Enter' && handleAdminReply(d.event_id, d.id)} />
                      <button onClick={() => handleAdminReply(d.event_id, d.id)} disabled={sendingReply || !replyInputs[d.id]?.trim()} style={btnStyle(replyInputs[d.id]?.trim() ? '#f59e0b' : '#0a3d22', replyInputs[d.id]?.trim() ? '#041f13' : '#3b7a5a', replyInputs[d.id]?.trim() ? '#f59e0b' : '#0a3d22')}>Reply</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button onClick={() => deleteDiscussion(d.id)} style={btnStyle('transparent', '#F09595', '#791F1F')}>🗑️ Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CONTACTS TAB */}
          {activeTab === TABS.CONTACTS && (
            <div>
              {contacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📩</span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No messages yet.</p>
                </div>
              ) : contacts.map((c, i) => (
                <div key={i} style={{ background: '#062616', border: `1px solid ${c.read ? '#0a3d22' : '#f59e0b'}`, borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500 }}>{c.name || 'User'}</span>
                      {!c.read && <span style={badge('#f59e0b', '#633806', '#f59e0b')}>New</span>}
                    </div>
                    <span style={{ color: '#3b7a5a', fontSize: '11px' }}>{fmtTime(c.created_at)}</span>
                  </div>
                  {c.events?.title && <p style={{ color: '#f59e0b', fontSize: '11px', margin: '0 0 6px' }}>Re: {c.events.title}</p>}
                  <p style={{ color: '#9fe1cb', fontSize: '13px', margin: '0 0 10px', lineHeight: '1.6' }}>{c.message}</p>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {c.phone && <a href={`tel:${c.phone}`} style={{ color: '#6ee7b7', fontSize: '12px', textDecoration: 'none' }}>📞 {c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} style={{ color: '#6ee7b7', fontSize: '12px', textDecoration: 'none' }}>✉️ {c.email}</a>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {!c.read && <button onClick={() => markContactRead(c.id)} style={btnStyle('#0a3d22', '#6ee7b7', '#6ee7b7')}>✅ Mark read</button>}
                    <button onClick={() => deleteContact(c.id)} style={btnStyle('transparent', '#F09595', '#791F1F')}>🗑️ Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
