import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

//  Constants
const STATUS_CONFIG = {
  pending: { color: 'var(--info)', bg: 'rgba(45,212,191,0.15)', label: 'Pending', icon: '⏳' },
  under_review: { color: 'var(--primary)', bg: 'rgba(255,255,255,0.12)', label: 'Under Review', icon: '' },
  approved: { color: 'var(--primary)', bg: 'rgba(255,255,255,0.12)', label: 'Approved', icon: '' },
  rejected: { color: 'var(--text)', bg: 'rgba(255,255,255,0.08)', label: 'Rejected', icon: '' },
}

const STATUSES = ['all', 'pending', 'under_review', 'approved', 'rejected']

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--info);color:var(--primary);padding:10px 20px;border-radius:100px;font-size:13px;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function GrantApplications() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)
  const [showRejectModal, setShowRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('grant_applications').select('*').order('created_at', { ascending: false })
      if (filter !== 'all') query = query.eq('status', filter)
      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      setApplications(data || [])
    } catch (err) {
      console.error('Grant fetch error:', err)
      setError('Failed to load applications.')
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchApplications() }, [fetchApplications])

  const updateStatus = async (id, newStatus, reason = null) => {
    setActionLoading(`${id}-${newStatus}`)
    try {
      const payload = { status: newStatus, reviewed_at: new Date().toISOString() }
      if (reason) payload.rejection_reason = reason
      const { error: updateError } = await supabase.from('grant_applications').update(payload).eq('id', id)
      if (updateError) throw updateError
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, rejection_reason: reason } : a))
      showToast(`Application ${newStatus.replace('_', ' ')}.`)
      if (newStatus === 'rejected') {
        setShowRejectModal(null)
        setRejectReason('')
      }
    } catch (err) { showToast('Update failed.', 'error') }
    setActionLoading(null)
  }

  const formatCurrency = (amount) => {
    if (!amount) return 'KSh 0'
    return `KSh ${Number(amount).toLocaleString()}`
  }

  const formatDate = (ts) => {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  //  Memoized filtered + sorted
  const filteredApplications = useMemo(() => {
    let list = applications
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(a =>
        (a.organization_name || '').toLowerCase().includes(q) ||
        (a.contact_name || '').toLowerCase().includes(q) ||
        (a.contact_email || '').toLowerCase().includes(q) ||
        (a.purpose || '').toLowerCase().includes(q)
      )
    }
    if (sortBy === 'amount_high') list = [...list].sort((a, b) => (Number(b.amount_requested) || 0) - (Number(a.amount_requested) || 0))
    else if (sortBy === 'amount_low') list = [...list].sort((a, b) => (Number(a.amount_requested) || 0) - (Number(b.amount_requested) || 0))
    else if (sortBy === 'org_name') list = [...list].sort((a, b) => (a.organization_name || '').localeCompare(b.organization_name || ''))
    return list
  }, [applications, searchQuery, sortBy])

  const counts = useMemo(() => {
    const c = { all: applications.length, pending: 0, under_review: 0, approved: 0, rejected: 0 }
    applications.forEach(a => { if (c[a.status] !== undefined) c[a.status]++ })
    return c
  }, [applications])

  const btnStyle = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: `1px solid ${border || bg}`,
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
  })

  const inputStyle = { padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '12px', fontFamily: "'Inter', sans-serif", outline: 'none' }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: 'var(--info)', fontSize: '13px' }}>Loading applications...</p>
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
            <button onClick={fetchApplications} style={btnStyle('transparent', 'var(--text)', 'var(--text)')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: "'Inter', sans-serif", margin: 0 }}> Grant Applications</h1>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>{applications.length} applications  · {counts.pending} pending</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchApplications} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid var(--info)', color: 'var(--info)', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder=" Search applications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, width: '240px' }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>
              <option value="newest">Newest</option>
              <option value="amount_high">Amount: High-Low</option>
              <option value="amount_low">Amount: Low-High</option>
              <option value="org_name">Organization Name</option>
            </select>
          </div>

          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {STATUSES.map(s => {
              const config = STATUS_CONFIG[s] || { color: 'var(--primary)', bg: 'rgba(255,255,255,0.12)', label: 'All', icon: '' }
              return (
                <button key={s} onClick={() => setFilter(s)}
                  style={{
                    padding: '8px 16px', borderRadius: '100px',
                    border: `1px solid ${filter === s ? config.color : 'rgba(255,255,255,0.12)'}`,
                    background: filter === s ? config.bg : 'transparent',
                    color: filter === s ? config.color : 'rgba(255,255,255,0.4)',
                    fontSize: '12px', fontWeight: filter === s ? 600 : 400,
                    cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.2s',
                  }}>
                  {s === 'all' ? ' All' : `${config.icon} ${config.label}`} ({counts[s] || 0})
                </button>
              )
            })}
          </div>

          {filteredApplications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
              <p style={{ color: 'var(--primary)', fontSize: '14px' }}>{searchQuery ? 'No applications match your search.' : 'No applications found.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredApplications.map(a => {
                const statusConfig = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending
                return (
                  <div key={a.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${statusConfig.color}33`, borderRadius: '12px', padding: '16px', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = statusConfig.color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = `${statusConfig.color}33`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{a.organization_name || 'Unknown Organization'}</span>
                          <span style={{ background: statusConfig.bg, color: statusConfig.color, padding: '3px 10px', borderRadius: '100px', fontSize: '10px', border: `1px solid ${statusConfig.color}33` }}>
                            {statusConfig.icon} {statusConfig.label}
                          </span>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px' }}>
                          {a.contact_name}  · {a.contact_email}
                        </p>
                        <p style={{ color: 'var(--primary)', fontSize: '16px', fontWeight: 700, fontFamily: "'Playfair Display', serif", margin: '0 0 4px' }}>
                          {formatCurrency(a.amount_requested)}
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '0 0 4px' }}>
                          Submitted: {formatDate(a.created_at)}
                          {a.reviewed_at && `  · Reviewed: ${formatDate(a.reviewed_at)}`}
                        </p>
                        {a.purpose && (
                          <p style={{ color: 'var(--info)', fontSize: '12px', margin: '6px 0 0', lineHeight: '1.5' }}>
                            {a.purpose.length > 200 ? (
                              <span title={a.purpose}>{a.purpose.slice(0, 200)}"¦</span>
                            ) : a.purpose}
                          </p>
                        )}
                        {a.rejection_reason && (
                          <p style={{ color: 'var(--text)', fontSize: '12px', margin: '6px 0 0', padding: '8px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                             Rejection reason: {a.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {(a.status === 'pending' || a.status === 'under_review') && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                        {a.status === 'pending' && (
                          <button onClick={() => updateStatus(a.id, 'under_review')} disabled={!!actionLoading}
                            style={btnStyle('transparent', 'var(--primary)', 'var(--primary)')}>
                            {actionLoading === `${a.id}-under_review` ? '...' : ' Mark Under Review'}
                          </button>
                        )}
                        <button onClick={() => updateStatus(a.id, 'approved')} disabled={!!actionLoading}
                          style={btnStyle('transparent', 'var(--primary)', 'var(--primary)')}>
                          {actionLoading === `${a.id}-approved` ? '...' : ' Approve'}
                        </button>
                        <button onClick={() => setShowRejectModal(a)} disabled={!!actionLoading}
                          style={btnStyle('transparent', 'var(--text)', 'rgba(255,255,255,0.08)')}>
                          {actionLoading === `${a.id}-rejected` ? '...' : ' Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div onClick={() => { setShowRejectModal(null); setRejectReason('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '420px', width: '100%' }}>
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 4px' }}> Reject Application</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '16px' }}>
              <strong style={{ color: 'var(--primary)' }}>"{showRejectModal.organization_name}"</strong>  · {formatCurrency(showRejectModal.amount_requested)}
            </p>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Rejection Reason</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Explain why this application is being rejected..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', fontFamily: "'Inter', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowRejectModal(null); setRejectReason('') }} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => updateStatus(showRejectModal.id, 'rejected', rejectReason.trim() || 'No reason provided')} disabled={!!actionLoading}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {actionLoading === `${showRejectModal.id}-rejected` ? '...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
