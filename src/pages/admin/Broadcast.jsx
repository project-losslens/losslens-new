import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

//  Constants
const MAX_BODY_LENGTH = 500
const SMS_MAX_LENGTH = 160
const HISTORY_LIMIT = 30
const SEND_COOLDOWN_MS = 5000

const TARGET_CONFIG = {
  all: { label: 'All Users', query: () => supabase.from('profiles').select('*', { count: 'exact', head: true }) },
  active: { label: 'Active This Week', query: () => { const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', weekAgo) } },
  inactive: { label: 'Inactive 7+ Days', query: () => { const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('profiles').select('*', { count: 'exact', head: true }).lt('last_active', weekAgo) } },
  high_risk: { label: 'High Risk Users', query: () => supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'high') },
  medium_risk: { label: 'Medium Risk Users', query: () => supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'medium') },
  new_users: { label: 'New Users (30 Days)', query: () => { const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString(); return supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo) } },
}

const TEMPLATES = [
  { label: ' Weekly Motivation', body: "Hey LossLens community! Another week, another chance to grow. Remember why you started. You've got this." },
  { label: ' Event Reminder', body: "Don't forget â€” we have an event coming up soon! Check the Events page for details and RSVP." },
  { label: 'ðŸ†˜ Resources Reminder', body: 'Need support? Our Resources page has Kenyan helplines and tools available 24/7. You are never alone.' },
  { label: ' Milestone Celebration', body: "We're celebrating your progress! Together you've logged thousands of clean days. Keep going!" },
]

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE') : 'â€”'

export default function Broadcast() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ title: '', body: '', target: 'all' })
  const [userCount, setUserCount] = useState(0)
  const [targetLabel, setTargetLabel] = useState('All Users')
  const [preview, setPreview] = useState(false)
  const [lastSendTime, setLastSendTime] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  //  Fetch correct user count based on target
  const fetchUserCount = useCallback(async (target) => {
    try {
      const config = TARGET_CONFIG[target]
      if (!config) return
      const { count } = await config.query()
      setUserCount(count || 0)
      setTargetLabel(config.label)
    } catch (err) { console.error('Count fetch error:', err) }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: broadcastHistory }] = await Promise.all([
        supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      ])
      setHistory(broadcastHistory || [])
    } catch (err) {
      setError('Failed to load broadcast data.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchUserCount(form.target) }, [form.target, fetchUserCount])

  const applyTemplate = (t) => setForm(p => ({ ...p, title: t.label, body: t.body }))

  //  Update target in form
  const handleTargetChange = (target) => {
    setForm(p => ({ ...p, target }))
    fetchUserCount(target)
  }

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) return showToast('Title and message are required.', 'error')

    //  Rate limiting
    const now = Date.now()
    if (now - lastSendTime < SEND_COOLDOWN_MS) { showToast('Please wait before sending again.', 'error'); return }
    setLastSendTime(now)

    setShowConfirm(false)
    setSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error: sendError } = await supabase.from('broadcasts').insert({
        title: form.title.trim(),
        body: form.body.trim(),
        target: form.target,
        target_label: targetLabel,
        sent_at: new Date().toISOString(),
        sent_to_count: userCount,
        sent_by: session?.user?.id || null,
        channel: 'in_app',
        status: 'sent',
      })
      if (sendError) throw sendError

      //  Also insert into notifications for in-app delivery
      if (form.target === 'all') {
        // For "all users" â€” batch notification insertion
        await supabase.from('notifications').insert({
          type: 'broadcast',
          title: form.title.trim(),
          message: form.body.trim().substring(0, 200),
          icon: '',
          link: '/dashboard',
          broadcast_id: null, // will be set by trigger
        })
      }

      showToast(` Broadcast sent to ~${userCount} ${targetLabel.toLowerCase()}!`)
      setForm({ title: '', body: '', target: 'all' })
      setPreview(false)
      fetchAll()
      fetchUserCount('all')
    } catch (err) {
      showToast('Send failed: ' + err.message, 'error')
    } finally { setSending(false) }
  }

  const isOverSMSLimit = form.body.length > SMS_MAX_LENGTH
  const targetDescription = useMemo(() => {
    const desc = {
      all: 'Every registered user on the platform',
      active: 'Users active in the last 7 days',
      inactive: 'Users who haven\'t been active for 7+ days',
      high_risk: 'Users with high risk level',
      medium_risk: 'Users with medium risk level',
      new_users: 'Users who joined in the last 30 days',
    }
    return desc[form.target] || ''
  }, [form.target])

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '13px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', outline: 'none' }
  const btn = (bg, color, border) => ({ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading broadcast...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchAll} style={btn('transparent', '#FFFFFF', '#FFFFFF')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Broadcast</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.08)', margin: '2px 0 0' }}>{userCount.toLocaleString()} {targetLabel.toLowerCase()} reachable</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => navigate('/admin')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Ã¢â€ Â Back</button>
          </div>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? 'rgba(255,255,255,0.08)' : '#7DBDEE', color: toast.type === 'error' ? '#FFFFFF' : '#2DD4BF', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Compose */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#2DD4BF', fontSize: '15px', margin: '0 0 1rem' }}> Compose Message</h3>

            {/* Templates */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Quick Templates</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button key={t.label} onClick={() => applyTemplate(t)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(45,212,191,0.15)', color: '#7DBDEE', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{t.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: '#2DD4BF', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Title *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="Broadcast title..." maxLength={100} />
              </div>

              <div>
                <label style={{ color: '#2DD4BF', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Message *</label>
                <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value.substring(0, MAX_BODY_LENGTH) }))} rows={5} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Write your message to users..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{form.body.length}/{MAX_BODY_LENGTH} characters</p>
                  {isOverSMSLimit && <p style={{ color: '#7DBDEE', fontSize: '11px', margin: 0 }}>Ã¢Å¡Â Ã¯Â¸Â Over SMS limit ({SMS_MAX_LENGTH} chars)</p>}
                </div>
              </div>

              <div>
                <label style={{ color: '#2DD4BF', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Target Audience</label>
                <select value={form.target} onChange={e => handleTargetChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {Object.entries(TARGET_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>{targetDescription}</p>
              </div>

              <div style={{ background: '#0B1220', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#2DD4BF', fontSize: '13px', fontWeight: 500 }}>Estimated Recipients</span>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '2px 0 0' }}>{targetLabel}</p>
                  </div>
                  <span style={{ color: '#2DD4BF', fontSize: '22px', fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>{userCount.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPreview(p => !p)} style={btn('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>{preview ? ' Hide Preview' : ' Preview'}</button>
                <button onClick={() => setShowConfirm(true)} disabled={sending || !form.title.trim() || !form.body.trim()}
                  style={{ ...btn('#2DD4BF', '#0B1220', '#2DD4BF'), opacity: (!form.title.trim() || !form.body.trim()) ? 0.5 : 1 }}>
                  {sending ? 'â³ Sending...' : ` Send to ${userCount.toLocaleString()} Users`}
                </button>
              </div>

              {preview && form.body && (
                <div style={{ background: '#0B1220', border: '1px solid #2DD4BF', borderRadius: '12px', padding: '16px', marginTop: '8px' }}>
                  <p style={{ color: '#2DD4BF', fontSize: '11px', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}> User Preview â€” {targetLabel}</p>
                  <p style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}>{form.title || 'Untitled'}</p>
                  <p style={{ color: '#2DD4BF', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{form.body}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '12px' }}>â€” LossLens Team </p>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 0.75rem' }}> Broadcast History</h3>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}></span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>No broadcasts sent yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((b, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '16px', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2DD4BF'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>{b.title}</span>
                      <span style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', border: '1px solid #2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{b.target_label || b.target || 'all'}</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtTime(b.sent_at)}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 8px', lineHeight: '1.5' }}>{b.body?.substring(0, 200)}{b.body?.length > 200 ? 'â€¦' : ''}</p>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#2DD4BF', fontSize: '11px' }}> {b.sent_to_count?.toLocaleString() || '0'} recipients</span>
                    <span style={{ color: '#7DBDEE', fontSize: '11px' }}>{b.channel || 'in-app'}</span>
                    <span style={{ color: b.status === 'sent' ? '#2DD4BF' : '#7DBDEE', fontSize: '11px' }}>{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid #2DD4BF', maxWidth: '450px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#2DD4BF', fontSize: '16px', marginBottom: '8px' }}>Confirm Broadcast</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '16px', lineHeight: '1.6' }}>
              Send <strong style={{ color: '#2DD4BF' }}>"{form.title}"</strong> to <strong style={{ color: '#2DD4BF' }}>{userCount.toLocaleString()} {targetLabel.toLowerCase()}</strong>?
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '20px' }}>{targetDescription}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={send} style={{ flex: 2, padding: '12px', borderRadius: '10px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Send Broadcast</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
