import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import UserAvatar from '../../components/UserAvatar'
import { BrandLoader } from '../../components/Brand'

const PLANS = { STANDARD: 'standard', ENTERPRISE: 'enterprise', CUSTOM: 'custom' }
const PLAN_COLORS = {
  [PLANS.STANDARD]: { color: 'var(--primary)', bg: 'rgba(255,255,255,0.12)', label: 'Standard' },
  [PLANS.ENTERPRISE]: { color: 'var(--primary)', bg: 'rgba(45,212,191,0.15)', label: 'Enterprise' },
  [PLANS.CUSTOM]: { color: 'var(--info)', bg: 'rgba(255,255,255,0.04)', label: 'Custom' },
}


export default function B2BClients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [clientMembers, setClientMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showToggleConfirm, setShowToggleConfirm] = useState(null)
  const [showMembers, setShowMembers] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    company_name: '', contact_email: '', contact_name: '', contact_phone: '',
    seats: '', plan: PLANS.STANDARD, status: 'active', notes: '', website: '', address: ''
  })

  const generateCompanyCode = (name) => {
    const base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return base + random
  }

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('b2b_clients').select('*').order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      const clientData = data || []
      setClients(clientData)

      // Fetch member counts for each client
      const memberCounts = {}
      for (const client of clientData) {
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('b2b_client_id', client.id)
        if (!countError) memberCounts[client.id] = count
      }
      setClientMembers(memberCounts)
    } catch (err) {
      console.error('B2B fetch error:', err)
      setError('Failed to load clients.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const fetchClientMembers = async (client) => {
    const { data } = await supabase.from('profiles').select('id, full_name, username, phone, streak_days, risk_level, last_active, avatar_url').eq('b2b_client_id', client.id).order('full_name', { ascending: true })
    setShowMembers({ client, members: data || [] })
  }

  const openCreate = () => {
    setEditingClient(null)
    setForm({ company_name: '', contact_email: '', contact_name: '', contact_phone: '', seats: '', plan: PLANS.STANDARD, status: 'active', notes: '', website: '', address: '' })
    setFormErrors({})
    setShowForm(true)
  }

  const openEdit = (c) => {
    setEditingClient(c)
    setForm({
      company_name: c.company_name || '', contact_email: c.contact_email || '',
      contact_name: c.contact_name || '', contact_phone: c.contact_phone || '',
      seats: c.seats || '', plan: c.plan || PLANS.STANDARD, status: c.status || 'active',
      notes: c.notes || '', website: c.website || '', address: c.address || ''
    })
    setFormErrors({})
    setShowForm(true)
  }

  const validateForm = () => {
    const errors = {}
    if (!form.company_name.trim()) errors.company_name = 'Company name is required'
    if (!form.contact_email.trim()) errors.contact_email = 'Contact email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.contact_email)) errors.contact_email = 'Enter a valid email'
    if (form.seats && (isNaN(parseInt(form.seats)) || parseInt(form.seats) < 1)) errors.seats = 'Enter a valid number'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveClient = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        seats: parseInt(form.seats) || 0,
        company_code: editingClient ? editingClient.company_code : generateCompanyCode(form.company_name)
      }
      const { error: saveError } = editingClient
        ? await supabase.from('b2b_clients').update(payload).eq('id', editingClient.id)
        : await supabase.from('b2b_clients').insert(payload)
      if (saveError) throw saveError
      toast.success(editingClient ? 'Client updated!' : 'Client added!')
      setShowForm(false)
      fetchClients()
    } catch (err) { toast.error('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  const toggleStatus = async (id, currentStatus) => {
    setActionLoading(id)
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setClients(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
    const { error: toggleError } = await supabase.from('b2b_clients').update({ status: newStatus }).eq('id', id)
    if (toggleError) {
      setClients(prev => prev.map(c => c.id === id ? { ...c, status: currentStatus } : c))
      toast.error('Update failed.')
    } else {
      toast.success(`Client ${newStatus === 'active' ? 'activated' : 'deactivated'}.`)
    }
    setActionLoading(null)
    setShowToggleConfirm(null)
  }

  const deleteClient = async (id) => {
    setDeleting(true)
    const { error: delError } = await supabase.from('b2b_clients').delete().eq('id', id)
    if (delError) {
      toast.error('Delete failed.')
    } else {
      setClients(prev => prev.filter(c => c.id !== id))
      toast.success('Client deleted.')
    }
    setDeleting(false)
    setShowDeleteConfirm(null)
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
    toast.success('Company code copied!')
  }

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = !searchQuery ||
        c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.company_code?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesPlan = planFilter === 'all' || c.plan === planFilter
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      return matchesSearch && matchesPlan && matchesStatus
    })
  }, [clients, searchQuery, planFilter, statusFilter])

  const activeCount = useMemo(() => clients.filter(c => c.status === 'active').length, [clients])

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)', boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <BrandLoader variant="section" />
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
            <button onClick={fetchClients} style={btnStyle('transparent', 'var(--text)', 'var(--text)')}>Retry</button>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}> B2B Clients</h1>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>{clients.length} total  · {activeCount} active</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchClients} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid var(--info)', color: 'var(--info)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Refresh</button>
            <button onClick={openCreate} style={{ padding: '8px 18px', borderRadius: '100px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Add Client</button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {/* Form Modal */}
          {showForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowForm(false)} />
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 1.25rem' }}>{editingClient ? ' Edit Client' : ' New B2B Client'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Company Name *</label>
                    <input type="text" value={form.company_name} onChange={e => { setForm(p => ({ ...p, company_name: e.target.value })); setFormErrors(p => ({ ...p, company_name: '' })) }} style={{ ...inputStyle, borderColor: formErrors.company_name ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. Acme Corp" />
                    {formErrors.company_name && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{formErrors.company_name}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Contact Name</label>
                      <input type="text" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} style={inputStyle} placeholder="e.g. Jane Doe" />
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Contact Email *</label>
                      <input type="email" value={form.contact_email} onChange={e => { setForm(p => ({ ...p, contact_email: e.target.value })); setFormErrors(p => ({ ...p, contact_email: '' })) }} style={{ ...inputStyle, borderColor: formErrors.contact_email ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} placeholder="jane@acme.com" />
                      {formErrors.contact_email && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{formErrors.contact_email}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Contact Phone</label>
                      <input type="text" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} style={inputStyle} placeholder="+254 7XX XXX XXX" />
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Website</label>
                      <input type="url" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} style={inputStyle} placeholder="https://acme.com" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Seats</label>
                      <NumberField value={form.seats} onChange={(seats) => { setForm((current) => ({ ...current, seats: seats ?? '' })); setFormErrors((current) => ({ ...current, seats: '' })) }} wrapperStyle={{ ...inputStyle, borderColor: formErrors.seats ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. 50" inputMode="numeric" min={1} step={1} />
                      {formErrors.seats && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{formErrors.seats}</span>}
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Plan</label>
                      <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value={PLANS.STANDARD}>Standard</option>
                        <option value={PLANS.ENTERPRISE}>Enterprise</option>
                        <option value={PLANS.CUSTOM}>Custom</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Address</label>
                    <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} style={inputStyle} placeholder="Nairobi, Kenya" />
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowForm(false)} style={btnStyle('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                    <button onClick={saveClient} disabled={saving} style={btnStyle('var(--primary)', 'var(--bg)', 'var(--primary)')}>{saving ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder=" Search clients or code..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, width: '240px', borderRadius: '100px' }} />
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '110px', cursor: 'pointer', borderRadius: '100px' }}>
              <option value="all">All Plans</option>
              {Object.entries(PLAN_COLORS).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '110px', cursor: 'pointer', borderRadius: '100px' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <AppIcon name="building" size={48} style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--primary)', fontSize: '14px' }}>{searchQuery || planFilter !== 'all' || statusFilter !== 'all' ? 'No clients match your filters.' : 'No B2B clients yet.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredClients.map(c => {
                const planColor = PLAN_COLORS[c.plan] || PLAN_COLORS[PLANS.STANDARD]
                const memberCount = clientMembers[c.id] || 0
                const seatsTotal = c.seats || 0
                const usagePercent = seatsTotal > 0 ? Math.round((memberCount / seatsTotal) * 100) : 0
                const seatColor = usagePercent >= 90 ? 'var(--text)' : usagePercent >= 70 ? 'var(--info)' : 'var(--primary)'

                return (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', padding: '16px', opacity: c.status === 'active' ? 1 : 0.6, transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = c.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{c.company_name}</span>
                          <span style={{ background: planColor.bg, color: planColor.color, padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: `1px solid ${planColor.color}33` }}>{planColor.label}</span>
                          <span style={{ background: c.status === 'active' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)', color: c.status === 'active' ? 'var(--primary)' : 'var(--text)', border: `1px solid ${c.status === 'active' ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{c.status}</span>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px' }}>{c.contact_name && `${c.contact_name}  · `}{c.contact_email}</p>

                        {/* Company Code */}
                        {c.company_code && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Code:</span>
                            <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: '4px', color: 'var(--primary)', fontSize: '12px', fontFamily: 'monospace', letterSpacing: '1px' }}>{c.company_code}</code>
                            <button onClick={() => copyCode(c.company_code)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', padding: '2px 4px' }} title="Copy code"></button>
                          </div>
                        )}

                        {/* Seat Usage Bar */}
                        {seatsTotal > 0 && (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}> Seats</span>
                              <span style={{ color: seatColor, fontSize: '10px', fontWeight: 500 }}>{memberCount} / {seatsTotal}</span>
                            </div>
                            <div style={{ height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(usagePercent, 100)}%`, background: seatColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                            </div>
                          </div>
                        )}

                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '6px 0 0' }}>
                          Joined {new Date(c.created_at).toLocaleDateString('en-KE')}
                          {c.notes && <span style={{ display: 'block', marginTop: '4px', color: 'var(--info)', fontSize: '11px', fontStyle: 'italic' }}> {c.notes.substring(0, 80)}{c.notes.length > 80 ? '"¦' : ''}</span>}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <button onClick={() => fetchClientMembers(c)} style={btnStyle('transparent', 'var(--primary)', 'var(--primary)')}> Members</button>
                        <button onClick={() => openEdit(c)} style={btnStyle('transparent', 'var(--info)', 'var(--info)')}></button>
                        <button onClick={() => setShowToggleConfirm(c)} disabled={actionLoading === c.id}
                          style={btnStyle('transparent', c.status === 'active' ? 'var(--info)' : 'var(--primary)', c.status === 'active' ? 'var(--info)' : 'var(--primary)')}>
                          {actionLoading === c.id ? '...' : c.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => setShowDeleteConfirm(c)} style={btnStyle('transparent', 'var(--text)', 'rgba(255,255,255,0.08)')}></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Members Modal */}
      {showMembers && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowMembers(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: 0 }}> {showMembers.client.company_name} — Members</h3>
              <button onClick={() => setShowMembers(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '20px', cursor: 'pointer' }}></button>
            </div>
            {showMembers.members.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '2rem' }}>No members yet. Share the company code <strong style={{ color: 'var(--primary)' }}>{showMembers.client.company_code}</strong> with employees.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {showMembers.members.map(m => (
                  <div key={m.id} style={{ background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <UserAvatar reference={m.avatar_url} name={m.full_name || m.username} size={32} />
                      <div>
                      <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{m.full_name || 'Unnamed'}</span>
                      {m.username && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginLeft: '6px' }}>@{m.username}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--primary)', fontSize: '11px' }}>{<AppIcon name="flame" size={12} />} {m.streak_days || 0}d</span>
                      <span style={{
                        background: m.risk_level === 'high' ? 'rgba(255,255,255,0.08)' : m.risk_level === 'medium' ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.12)',
                        color: m.risk_level === 'high' ? 'var(--text)' : m.risk_level === 'medium' ? 'var(--info)' : 'var(--primary)',
                        padding: '2px 8px', borderRadius: '100px', fontSize: '10px'
                      }}>{m.risk_level || 'low'}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{m.last_active ? new Date(m.last_active).toLocaleDateString('en-KE') : 'Never'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Modal */}
      {showToggleConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowToggleConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: `1px solid ${showToggleConfirm.status === 'active' ? 'var(--info)' : 'var(--primary)'}`, maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{showToggleConfirm.status === 'active' ? 'Pause' : 'Resume'}</span>
            <h3 style={{ color: showToggleConfirm.status === 'active' ? 'var(--info)' : 'var(--primary)', fontSize: '16px', margin: '0 0 8px' }}>
              {showToggleConfirm.status === 'active' ? 'Deactivate Client?' : 'Activate Client?'}
            </h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--primary)' }}>"{showToggleConfirm.company_name}"</strong> will be {showToggleConfirm.status === 'active' ? 'deactivated' : 'reactivated'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowToggleConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => toggleStatus(showToggleConfirm.id, showToggleConfirm.status)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showToggleConfirm.status === 'active' ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.12)', border: 'none', color: showToggleConfirm.status === 'active' ? 'var(--primary)' : 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {showToggleConfirm.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowDeleteConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="alert" size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Delete Client?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: 'var(--primary)' }}>"{showDeleteConfirm.company_name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => deleteClient(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
