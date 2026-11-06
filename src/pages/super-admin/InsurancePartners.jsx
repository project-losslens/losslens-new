import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

//  Constants
const COVERAGE_TYPES = ['Mental Health', 'Addiction Rehab', 'Inpatient', 'Outpatient', 'Counseling', 'Crisis Intervention', 'General Health', 'Employee Wellness', 'Other']

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function InsurancePartners() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingPartner, setEditingPartner] = useState(null)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showToggleConfirm, setShowToggleConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    company_name: '', contact_email: '', contact_name: '',
    coverage_type: '', commission_pct: '', status: 'active', notes: ''
  })

  const fetchPartners = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('insurance_partners').select('*').order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      setPartners(data || [])
    } catch (err) {
      console.error('Insurance fetch error:', err)
      setError('Failed to load partners.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPartners() }, [fetchPartners])

  const openCreate = () => {
    setEditingPartner(null)
    setForm({ company_name: '', contact_email: '', contact_name: '', coverage_type: '', commission_pct: '', status: 'active', notes: '' })
    setFormErrors({})
    setShowForm(true)
  }

  const openEdit = (p) => {
    setEditingPartner(p)
    setForm({
      company_name: p.company_name || '', contact_email: p.contact_email || '',
      contact_name: p.contact_name || '', coverage_type: p.coverage_type || '',
      commission_pct: p.commission_pct || '', status: p.status || 'active', notes: p.notes || ''
    })
    setFormErrors({})
    setShowForm(true)
  }

  //  Validate form
  const validateForm = () => {
    const errors = {}
    if (!form.company_name.trim()) errors.company_name = 'Company name is required'
    if (!form.contact_email.trim()) errors.contact_email = 'Contact email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.contact_email)) errors.contact_email = 'Enter a valid email'
    if (form.commission_pct) {
      const pct = parseFloat(form.commission_pct)
      if (isNaN(pct) || pct < 0 || pct > 100) errors.commission_pct = 'Enter 0-100'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const savePartner = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = { ...form, commission_pct: form.commission_pct ? parseFloat(form.commission_pct) : null }
      const { error: saveError } = editingPartner
        ? await supabase.from('insurance_partners').update(payload).eq('id', editingPartner.id)
        : await supabase.from('insurance_partners').insert(payload)
      if (saveError) throw saveError
      showToast(editingPartner ? 'Partner updated!' : 'Partner added!')
      setShowForm(false)
      fetchPartners()
    } catch (err) { showToast('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  const toggleStatus = async (id, currentStatus) => {
    setActionLoading(id)
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    // Optimistic update
    setPartners(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p))
    const { error: toggleError } = await supabase.from('insurance_partners').update({ status: newStatus }).eq('id', id)
    if (toggleError) {
      setPartners(prev => prev.map(p => p.id === id ? { ...p, status: currentStatus } : p))
      showToast('Update failed.')
    } else {
      showToast(`Partner ${newStatus === 'active' ? 'activated' : 'deactivated'}.`)
    }
    setActionLoading(null)
    setShowToggleConfirm(null)
  }

  const deletePartner = async (id) => {
    setDeleting(true)
    const { error: delError } = await supabase.from('insurance_partners').delete().eq('id', id)
    if (delError) {
      showToast('Delete failed.')
    } else {
      setPartners(prev => prev.filter(p => p.id !== id))
      showToast('Partner deleted.')
    }
    setDeleting(false)
    setShowDeleteConfirm(null)
  }

  //  Memoized filtered
  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesSearch = !searchQuery ||
        p.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.coverage_type?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [partners, searchQuery, statusFilter])

  const activeCount = useMemo(() => partners.filter(p => p.status === 'active').length, [partners])

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '13px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading partners...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchPartners} style={btnStyle('transparent', '#FFFFFF', '#FFFFFF')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid #2DD4BF', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#2DD4BF', fontFamily: "'Inter', sans-serif", margin: 0 }}>Insurance Partners</h1>
            <p style={{ fontSize: '12px', color: '#7DBDEE', margin: '2px 0 0' }}>{partners.length} total Â· {activeCount} active</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchPartners} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #7DBDEE', color: '#7DBDEE', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Refresh</button>
            <button onClick={openCreate} style={{ padding: '8px 18px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Add Partner</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {/* Form Modal */}
          {showForm && (
            <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ color: '#2DD4BF', fontSize: '16px', margin: '0 0 1.25rem' }}>{editingPartner ? 'Edit Partner' : 'New Insurance Partner'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Company Name *</label>
                    <input type="text" value={form.company_name} onChange={e => { setForm(p => ({ ...p, company_name: e.target.value })); setFormErrors(p => ({ ...p, company_name: '' })) }} style={{ ...inputStyle, borderColor: formErrors.company_name ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. Jubilee Insurance" />
                    {formErrors.company_name && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{formErrors.company_name}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Contact Name</label>
                      <input type="text" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} style={inputStyle} placeholder="e.g. John Kamau" />
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Contact Email *</label>
                      <input type="email" value={form.contact_email} onChange={e => { setForm(p => ({ ...p, contact_email: e.target.value })); setFormErrors(p => ({ ...p, contact_email: '' })) }} style={{ ...inputStyle, borderColor: formErrors.contact_email ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} placeholder="john@jubilee.co.ke" />
                      {formErrors.contact_email && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{formErrors.contact_email}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Coverage Type</label>
                      <select value={form.coverage_type} onChange={e => setForm(p => ({ ...p, coverage_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Select type...</option>
                        {COVERAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Commission % (0-100)</label>
                      <input type="number" value={form.commission_pct} onChange={e => { setForm(p => ({ ...p, commission_pct: e.target.value })); setFormErrors(p => ({ ...p, commission_pct: '' })) }} style={{ ...inputStyle, borderColor: formErrors.commission_pct ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. 10" min="0" max="100" step="0.1" />
                      {formErrors.commission_pct && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{formErrors.commission_pct}</span>}
                    </div>
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowForm(false)} style={btnStyle('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                    <button onClick={savePartner} disabled={saving} style={btnStyle('#2DD4BF', '#0B1220', '#2DD4BF')}>{saving ? 'Saving...' : editingPartner ? 'Update Partner' : 'Add Partner'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search partners..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, width: '240px', borderRadius: '100px' }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '110px', cursor: 'pointer', borderRadius: '100px' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {filteredPartners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>{'\u{1F3E5}'}</span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>{searchQuery || statusFilter !== 'all' ? 'No partners match your filters.' : 'No insurance partners yet.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredPartners.map(p => (
                <div key={p.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${p.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', padding: '16px', opacity: p.status === 'active' ? 1 : 0.6, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2DD4BF'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = p.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>{p.company_name}</span>
                        <span style={{ background: p.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)', color: p.status === 'active' ? '#2DD4BF' : '#FFFFFF', border: `1px solid ${p.status === 'active' ? '#2DD4BF' : 'rgba(255,255,255,0.08)'}`, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{p.status}</span>
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px' }}>{p.contact_name} Â· {p.contact_email}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>
                        {p.coverage_type || 'General'} Â· {p.commission_pct || 0}% commission
                        {p.notes && <span style={{ display: 'block', marginTop: '4px', color: '#7DBDEE', fontSize: '11px', fontStyle: 'italic' }}>{'\u{1F4DD}'} {p.notes.substring(0, 80)}{p.notes.length > 80 ? '...' : ''}</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <button onClick={() => openEdit(p)} style={btnStyle('transparent', '#7DBDEE', '#7DBDEE')}>Edit</button>
                      <button onClick={() => setShowToggleConfirm(p)} disabled={actionLoading === p.id}
                        style={btnStyle('transparent', p.status === 'active' ? '#7DBDEE' : '#2DD4BF', p.status === 'active' ? '#7DBDEE' : '#2DD4BF')}>
                        {actionLoading === p.id ? '...' : p.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(p)} style={btnStyle('transparent', '#FFFFFF', 'rgba(255,255,255,0.08)')}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Confirmation Modal */}
      {showToggleConfirm && (
        <div onClick={() => setShowToggleConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: `1px solid ${showToggleConfirm.status === 'active' ? '#7DBDEE' : '#2DD4BF'}`, maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{showToggleConfirm.status === 'active' ? '\u{23F8}' : '\u{25B6}'}</span>
            <h3 style={{ color: showToggleConfirm.status === 'active' ? '#7DBDEE' : '#2DD4BF', fontSize: '16px', margin: '0 0 8px' }}>
              {showToggleConfirm.status === 'active' ? 'Deactivate Partner?' : 'Activate Partner?'}
            </h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              <strong style={{ color: '#2DD4BF' }}>"{showToggleConfirm.company_name}"</strong> will be {showToggleConfirm.status === 'active' ? 'deactivated' : 'reactivated'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowToggleConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => toggleStatus(showToggleConfirm.id, showToggleConfirm.status)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showToggleConfirm.status === 'active' ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.12)', border: 'none', color: showToggleConfirm.status === 'active' ? '#2DD4BF' : '#2DD4BF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {showToggleConfirm.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{'\u{1F5D1}'}</span>
            <h3 style={{ color: '#FFFFFF', fontSize: '16px', margin: '0 0 8px' }}>Delete Partner?</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: '#2DD4BF' }}>"{showDeleteConfirm.company_name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => deletePartner(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
