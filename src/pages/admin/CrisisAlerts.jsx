import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'

export default function CrisisAlerts() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [resolved, setResolved] = useState([])
  const [activeTab, setActiveTab] = useState('open')
  const [toast, setToast] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [notes, setNotes] = useState({})
  const [resolvingId, setResolvingId] = useState(null)
  const [escalatingId, setEscalatingId] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: open }, { data: done }] = await Promise.all([
        supabase.from('crisis_alerts').select('*, profiles(full_name, username, email, phone, risk_level, streak_days)').eq('resolved', false).order('created_at', { ascending: false }),
        supabase.from('crisis_alerts').select('*, profiles(full_name, username)').eq('resolved', true).order('resolved_at', { ascending: false }).limit(30),
      ])
      setAlerts(open || [])
      setResolved(done || [])
    } catch (err) {
      setError('Failed to load crisis alerts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const resolveAlert = async (id) => {
    setResolvingId(id)
    const { error: resolveError } = await supabase.from('crisis_alerts').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      admin_notes: notes[id] || null
    }).eq('id', id)
    if (resolveError) {
      showToast('Failed to resolve.', 'error')
    } else {
      showToast(' Alert marked as resolved.')
      setNotes(prev => { const n = { ...prev }; delete n[id]; return n })
      setExpandedId(null)
      fetchAll()
    }
    setResolvingId(null)
  }

  const escalate = async (alert) => {
    setEscalatingId(alert.id)
    const { error: escError } = await supabase.from('crisis_alerts').update({
      admin_notes: ` ESCALATED: ${new Date().toLocaleString('en-KE')} — Requires immediate counselor intervention.`
    }).eq('id', alert.id)
    if (escError) {
      showToast('Escalation failed.', 'error')
    } else {
      showToast(' Alert escalated! Contact counselor immediately.')
    }
    setEscalatingId(null)
  }

  const btn = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: `1px solid ${border || bg}`,
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F09595', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
          </div>
          <p style={{ color: '#F09595', fontSize: '13px' }}>Loading crisis alerts...</p>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#F09595', marginBottom: '12px' }}>{error}</p>
          <button onClick={fetchAll} style={btn('transparent', '#F09595', '#F09595')}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
      <AdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#041f13', borderBottom: '2px solid #791F1F', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#F09595', fontFamily: "'Inter', sans-serif", margin: 0 }}>🆘 Crisis Alerts</h1>
            <p style={{ fontSize: '12px', color: '#791F1F', margin: '2px 0 0' }}>{alerts.length} open · {resolved.length} resolved</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => navigate('/admin')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>← Back</button>
          </div>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#791F1F' : '#1d5c38', color: toast.type === 'error' ? '#F09595' : '#6ee7b7', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000 }}>{toast.msg}</div>
        )}

        {alerts.length > 0 && (
          <div style={{ margin: '1rem 1.5rem 0', padding: '12px 16px', background: '#791F1F', borderRadius: '10px', border: '1px solid #F09595' }}>
            <p style={{ color: '#F09595', fontSize: '13px', fontWeight: 600, margin: 0 }}> {alerts.length} open crisis alert{alerts.length > 1 ? 's' : ''} — requires immediate attention</p>
          </div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: '#062616', borderRadius: '12px', padding: '4px', border: '1px solid #0a3d22' }}>
            {[{ id: 'open', label: ` Open (${alerts.length})` }, { id: 'resolved', label: ` Resolved (${resolved.length})` }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? (tab.id === 'open' ? '#791F1F' : '#0a3d22') : 'transparent', color: activeTab === tab.id ? (tab.id === 'open' ? '#F09595' : '#6ee7b7') : '#3b7a5a', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{tab.label}</button>
            ))}
          </div>

          {activeTab === 'open' && (
            alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a' }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No open crisis alerts. All clear.</p>
              </div>
            ) : alerts.map(a => (
              <div key={a.id} style={{ background: '#062616', border: '2px solid #791F1F', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 0 16px rgba(240,149,149,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <p style={{ color: '#F09595', fontSize: '15px', fontWeight: 600, margin: 0 }}>
                        {a.profiles?.full_name || a.profiles?.username || `User #${a.user_id?.slice(0, 8)}`}
                      </p>
                      {a.profiles?.risk_level === 'high' && (
                        <span style={{ background: '#791F1F', color: '#F09595', border: '1px solid #F09595', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}> HIGH RISK</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span style={{ color: '#3b7a5a', fontSize: '11px' }}> {fmtTime(a.created_at)}</span>
                      {a.profiles?.streak_days !== undefined && <span style={{ color: '#FAC775', fontSize: '11px' }}> {a.profiles.streak_days}d streak</span>}
                    </div>
                  </div>
                </div>

                {a.keyword && (
                  <div style={{ background: '#791F1F33', border: '1px solid #791F1F', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
                    <p style={{ color: '#F09595', fontSize: '13px', margin: 0 }}> Trigger keyword: <strong>"{a.keyword}"</strong></p>
                  </div>
                )}

                {a.message_context && (
                  <div style={{ background: '#041f13', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
                    <p style={{ color: '#3b7a5a', fontSize: '12px', fontStyle: 'italic', margin: 0, lineHeight: '1.5' }}>"{a.message_context}"</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {a.profiles?.email && <a href={`mailto:${a.profiles.email}`} style={{ color: '#6ee7b7', fontSize: '11px', textDecoration: 'none' }}> {a.profiles.email}</a>}
                  {a.profiles?.phone && <a href={`tel:${a.profiles.phone}`} style={{ color: '#6ee7b7', fontSize: '11px', textDecoration: 'none' }}> {a.profiles.phone}</a>}
                </div>

                <button onClick={() => setExpandedId(expandedId === a.id ? null : a.id)} style={{ ...btn('transparent', '#3b7a5a', '#0a3d22'), marginBottom: '8px', fontSize: '11px' }}>
                  {expandedId === a.id ? '▲ Hide notes' : '▼ Add resolution notes'}
                </button>

                {expandedId === a.id && (
                  <div style={{ marginBottom: '10px' }}>
                    <textarea
                      value={notes[a.id] || ''}
                      onChange={e => setNotes(p => ({ ...p, [a.id]: e.target.value }))}
                      placeholder="Add follow-up notes..."
                      rows={3}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#e2f5ec', fontSize: '12px', fontFamily: "'Inter', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => resolveAlert(a.id)} disabled={resolvingId === a.id} style={btn('#0a3d22', '#6ee7b7', '#6ee7b7')}>
                    {resolvingId === a.id ? '⏳...' : ' Mark Resolved'}
                  </button>
                  <button onClick={() => escalate(a)} disabled={escalatingId === a.id} style={btn('#791F1F', '#F09595', '#F09595')}>
                    {escalatingId === a.id ? '⏳...' : ' Escalate'}
                  </button>
                </div>
              </div>
            ))
          )}

          {activeTab === 'resolved' && (
            resolved.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a' }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No resolved alerts yet.</p>
              </div>
            ) : resolved.map(a => (
              <div key={a.id} style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    <p style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500, margin: '0 0 4px' }}>{a.profiles?.full_name || `User #${a.user_id?.slice(0, 8)}`}</p>
                    {a.keyword && <p style={{ color: '#3b7a5a', fontSize: '11px', margin: 0 }}>Keyword: "{a.keyword}"</p>}
                    {a.admin_notes && <p style={{ color: '#FAC775', fontSize: '11px', margin: '4px 0 0' }}> {a.admin_notes}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ background: '#0a3d22', color: '#6ee7b7', border: '1px solid #6ee7b7', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>Resolved</span>
                    <p style={{ color: '#3b7a5a', fontSize: '11px', margin: '4px 0 0' }}>{fmtTime(a.resolved_at)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
