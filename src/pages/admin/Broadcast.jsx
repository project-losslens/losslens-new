import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'

//  Constants
const MAX_BODY_LENGTH = 500
const SMS_MAX_LENGTH = 160
const HISTORY_LIMIT = 30
const SEND_COOLDOWN_MS = 5000

const TARGET_CONFIG = {
  all: { label: 'All Users', query: () => supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }) },
  active: { label: 'Active This Week', query: () => { const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }).gte('last_active', weekAgo) } },
  inactive: { label: 'Inactive 7+ Days', query: () => { const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }).or(`last_active.is.null,last_active.lt.${weekAgo}`) } },
  high_risk: { label: 'High Risk Users', query: () => supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }).eq('risk_level', 'high') },
  medium_risk: { label: 'Medium Risk Users', query: () => supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }).eq('risk_level', 'medium') },
  new_users: { label: 'New Users (30 Days)', query: () => { const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString(); return supabase.from('admin_profiles_safe').select('id', { count: 'exact', head: true }).gte('created_at', monthAgo) } },
}

const TEMPLATES = [
  { label: ' Weekly Motivation', body: "Hey LossLens community! Another week, another chance to grow. Remember why you started. You've got this." },
  { label: ' Event Reminder', body: "Don't forget — we have an event coming up soon! Check the Events page for details and RSVP." },
  { label: '🆘 Resources Reminder', body: 'Need support? Our Resources page has Kenyan helplines and tools available 24/7. You are never alone.' },
  { label: ' Milestone Celebration', body: "We're celebrating your progress! Together you've logged thousands of clean days. Keep going!" },
]

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'

export default function Broadcast() {
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
      const { data, error: sendError } = await supabase.rpc('send_broadcast', {
        p_title: form.title.trim(),
        p_message: form.body.trim(),
        p_audience: form.target,
      })
      if (sendError) throw sendError
      const recipientCount = data?.recipient_count ?? userCount

      showToast(` Broadcast sent to ${recipientCount.toLocaleString()} ${targetLabel.toLowerCase()}!`)
      setForm({ title: '', body: '', target: 'all' })
      setPreview(false)
      fetchAll()
      fetchUserCount('all')
    } catch (err) {
      showToast('Send failed: ' + (err.message || 'Unknown error'), 'error')
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

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)', boxSizing: 'border-box', outline: 'none' }
  const btn = (bg, color, border) => ({ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: 'var(--info)', fontSize: '13px' }}>Loading broadcast...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchAll} style={btn('transparent', 'var(--text)', 'var(--text)')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)', margin: 0 }}> Broadcast</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{userCount.toLocaleString()} {targetLabel.toLowerCase()} reachable</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Refresh</button>
          </div>
        </div>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? 'rgba(255,255,255,0.08)' : 'var(--info)', color: toast.type === 'error' ? 'var(--text)' : 'var(--primary)', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 'var(--z-toast)', whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Compose */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}> Compose Message</h3>

            {/* Templates */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Quick Templates</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button key={t.label} onClick={() => applyTemplate(t)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(45,212,191,0.15)', color: 'var(--info)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{t.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Title *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="Broadcast title..." maxLength={100} />
              </div>

              <div>
                <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Message *</label>
                <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value.substring(0, MAX_BODY_LENGTH) }))} rows={5} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Write your message to users..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{form.body.length}/{MAX_BODY_LENGTH} characters</p>
                  {isOverSMSLimit && <p style={{ color: 'var(--info)', fontSize: '11px', margin: 0 }}>⚠️ Over SMS limit ({SMS_MAX_LENGTH} chars)</p>}
                </div>
              </div>

              <div>
                <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Target Audience</label>
                <select value={form.target} onChange={e => handleTargetChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {Object.entries(TARGET_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>{targetDescription}</p>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--primary)', fontSize: '13px', fontWeight: 500 }}>Estimated Recipients</span>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '2px 0 0' }}>{targetLabel}</p>
                  </div>
                  <span style={{ color: 'var(--primary)', fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{userCount.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPreview(p => !p)} style={btn('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>{preview ? ' Hide Preview' : ' Preview'}</button>
                <button onClick={() => setShowConfirm(true)} disabled={sending || !form.title.trim() || !form.body.trim()}
                  style={{ ...btn('var(--primary)', 'var(--bg)', 'var(--primary)'), opacity: (!form.title.trim() || !form.body.trim()) ? 0.5 : 1 }}>
                  {sending ? '⏳ Sending...' : ` Send to ${userCount.toLocaleString()} Users`}
                </button>
              </div>

              {preview && form.body && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: '12px', padding: '16px', marginTop: '8px' }}>
                  <p style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}> User Preview — {targetLabel}</p>
                  <p style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}>{form.title || 'Untitled'}</p>
                  <p style={{ color: 'var(--primary)', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{form.body}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '12px' }}>— LossLens Team </p>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <h3 style={{ color: 'var(--text)', fontSize: '15px', margin: '0 0 0.75rem' }}> Broadcast History</h3>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <AppIcon name="broadcast" size={40} style={{ display: 'block', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--primary)', fontSize: '14px' }}>No broadcasts sent yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((b, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '16px', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{b.title}</span>
                      <span style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{b.audience || 'all'}</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtTime(b.sent_at)}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 8px', lineHeight: '1.5' }}>{b.message?.substring(0, 200)}{b.message?.length > 200 ? '…' : ''}</p>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {b.recipient_count?.toLocaleString() || '0'} recipients</span>
                    <span style={{ color: 'var(--info)', fontSize: '11px' }}>in-app</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowConfirm(false)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--primary)', maxWidth: '450px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="alert" size={40} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', marginBottom: '8px' }}>Confirm Broadcast</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '16px', lineHeight: '1.6' }}>
              Send <strong style={{ color: 'var(--primary)' }}>"{form.title}"</strong> to <strong style={{ color: 'var(--primary)' }}>{userCount.toLocaleString()} {targetLabel.toLowerCase()}</strong>?
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '20px' }}>{targetDescription}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={send} style={{ flex: 2, padding: '12px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Send Broadcast</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
