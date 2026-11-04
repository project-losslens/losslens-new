import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

//  Constants
const CATEGORIES = ['Helpline', 'App', 'Podcast', 'Self-exclusion', 'Financial', 'Mindfulness', 'Other']

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1d5c38;color:#6ee7b7;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid #3b7a5a;white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function ManageResources() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resources, setResources] = useState([])
  const [toast, setToast] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({ name: '', description: '', phone: '', url: '', category: 'Helpline', hours: '', active: true })

  const displayToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  //  Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('resources').select('*').order('category').order('name')
      if (fetchError) throw fetchError
      setResources(data || [])
    } catch (err) {
      setError('Failed to load resources.')
      console.error('Resource fetch error:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', phone: '', url: '', category: 'Helpline', hours: '', active: true })
    setFormErrors({})
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({ name: r.name, description: r.description || '', phone: r.phone || '', url: r.url || '', category: r.category || 'Helpline', hours: r.hours || '', active: r.active })
    setFormErrors({})
    setShowForm(true)
  }

  //  Validate form
  const validateForm = () => {
    const errors = {}
    if (!form.name.trim()) errors.name = 'Name is required'
    if (form.url && !/^https?:\/\/.+/.test(form.url)) errors.url = 'Enter a valid URL (https://...)'
    if (form.phone && !/^[\d\s+()-]+$/.test(form.phone)) errors.phone = 'Invalid phone format'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveResource = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = { ...form, phone: form.phone || null, url: form.url || null, hours: form.hours || null }
      const { error: saveError } = editing
        ? await supabase.from('resources').update(payload).eq('id', editing.id)
        : await supabase.from('resources').insert(payload)
      if (saveError) throw saveError
      displayToast(editing ? 'Resource updated.' : 'Resource added.')
      setShowForm(false)
      fetchAll()
    } catch (err) { displayToast('Save failed: ' + err.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleActive = async (r) => {
    const newActive = !r.active
    //  Optimistic update
    setResources(prev => prev.map(item => item.id === r.id ? { ...item, active: newActive } : item))
    const { error: toggleError } = await supabase.from('resources').update({ active: newActive }).eq('id', r.id)
    if (toggleError) {
      // Rollback
      setResources(prev => prev.map(item => item.id === r.id ? { ...item, active: !newActive } : item))
      displayToast('Update failed.', 'error')
    } else {
      displayToast(newActive ? 'Resource activated.' : 'Resource hidden.')
    }
  }

  const deleteResource = async (id) => {
    setDeleting(true)
    const { error: delError } = await supabase.from('resources').delete().eq('id', id)
    if (delError) {
      displayToast('Delete failed.', 'error')
    } else {
      setResources(prev => prev.filter(r => r.id !== id))
      displayToast('Resource deleted.')
    }
    setDeleting(false)
    setShowDeleteConfirm(null)
  }

  //  Memoized filtered resources
  const filtered = useMemo(() => resources.filter(r =>
    (filter === 'All' || r.category === filter) &&
    (r.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || (r.description || '').toLowerCase().includes(debouncedSearch.toLowerCase()))
  ), [resources, filter, debouncedSearch])

  const activeCount = useMemo(() => resources.filter(r => r.active).length, [resources])

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#e2f5ec', fontSize: '13px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6ee7b7', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#6ee7b7', fontSize: '13px' }}>Loading resources...</p>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#F09595', fontFamily: "'Inter', sans-serif", margin: 0 }}> Manage Resources</h1>
            <p style={{ fontSize: '12px', color: '#791F1F', margin: '2px 0 0' }}>{resources.length} total · {activeCount} active</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => navigate('/admin')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #791F1F', color: '#F09595', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>← Back</button>
          </div>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#791F1F' : '#1d5c38', color: toast.type === 'error' ? '#F09595' : '#6ee7b7', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #0a3d22', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ color: '#6ee7b7', fontSize: '16px', margin: '0 0 1.25rem' }}>{editing ? ' Edit Resource' : ' Add Resource'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Name *</label>
                  <input type="text" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormErrors(p => ({ ...p, name: '' })) }} style={{ ...inputStyle, borderColor: formErrors.name ? '#F09595' : '#0a3d22' }} placeholder="e.g. NACADA Helpline" />
                  {formErrors.name && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.name}</span>}
                </div>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Phone / Shortcode</label>
                    <input type="text" value={form.phone} onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); setFormErrors(p => ({ ...p, phone: '' })) }} style={{ ...inputStyle, borderColor: formErrors.phone ? '#F09595' : '#0a3d22' }} placeholder="e.g. 1192" />
                    {formErrors.phone && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.phone}</span>}
                  </div>
                  <div>
                    <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Hours</label>
                    <input type="text" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} style={inputStyle} placeholder="e.g. 24/7 or Mon-Fri 8am-5pm" />
                  </div>
                </div>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>URL / Website</label>
                  <input type="url" value={form.url} onChange={e => { setForm(p => ({ ...p, url: e.target.value })); setFormErrors(p => ({ ...p, url: '' })) }} style={{ ...inputStyle, borderColor: formErrors.url ? '#F09595' : '#0a3d22' }} placeholder="https://..." />
                  {formErrors.url && <span style={{ fontSize: '11px', color: '#F09595' }}>{formErrors.url}</span>}
                </div>
                <div>
                  <label style={{ color: '#3b7a5a', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#6ee7b7' }} />
                  <span style={{ color: '#3b7a5a', fontSize: '11px' }}>Active (visible to users)</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowForm(false)} style={btnStyle('transparent', '#3b7a5a', '#0a3d22')}>Cancel</button>
                  <button onClick={saveResource} disabled={saving} style={btnStyle('#6ee7b7', '#041f13', '#6ee7b7')}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder=" Search resources..." style={{ ...inputStyle, width: '220px', paddingRight: '32px' }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#3b7a5a', cursor: 'pointer', fontSize: '14px', padding: '4px 6px' }}></button>}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
              {['All', ...CATEGORIES].map(c => (
                <button key={c} onClick={() => setFilter(c)} style={{ padding: '6px 12px', borderRadius: '100px', border: `1px solid ${filter === c ? '#6ee7b7' : '#0a3d22'}`, background: filter === c ? '#0a3d22' : 'transparent', color: filter === c ? '#6ee7b7' : '#3b7a5a', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', transition: 'all 0.2s' }}>{c}</button>
              ))}
            </div>
            <button onClick={openCreate} style={btnStyle('#6ee7b7', '#041f13', '#6ee7b7')}> Add</button>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
              <p style={{ color: '#6ee7b7', fontSize: '14px' }}>{debouncedSearch || filter !== 'All' ? 'No resources match your search.' : 'No resources yet.'}</p>
              {(debouncedSearch || filter !== 'All') && <button onClick={() => { setSearch(''); setFilter('All') }} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid #6ee7b7', color: '#6ee7b7', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Clear filters</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(r => (
                <div key={r.id} style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '12px', padding: '16px', opacity: r.active ? 1 : 0.6, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#f59e0b'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#0a3d22'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ color: '#e2f5ec', fontSize: '14px', fontWeight: 600 }}>{r.name}</span>
                        <span style={{ background: '#0a3d22', color: '#6ee7b7', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid #1d5c38' }}>{r.category}</span>
                        {!r.active && <span style={{ background: '#3a1010', color: '#F09595', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid #791F1F' }}>Hidden</span>}
                      </div>
                      {r.description && <p style={{ color: '#3b7a5a', fontSize: '12px', margin: '0 0 6px', lineHeight: '1.4' }}>{r.description}</p>}
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        {r.phone && <span style={{ color: '#6ee7b7', fontSize: '12px' }}> {r.phone}</span>}
                        {r.hours && <span style={{ color: '#3b7a5a', fontSize: '11px' }}> {r.hours}</span>}
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#FAC775', fontSize: '12px', textDecoration: 'none' }} title={r.url}>
                             {r.url.length > 40 ? r.url.substring(0, 40) + '…' : r.url}
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <button onClick={() => openEdit(r)} style={btnStyle('transparent', '#FAC775', '#FAC775')} title="Edit"></button>
                      <button onClick={() => toggleActive(r)} style={btnStyle('transparent', r.active ? '#FAC775' : '#6ee7b7', r.active ? '#FAC775' : '#6ee7b7')} title={r.active ? 'Hide from users' : 'Show to users'}>
                        {r.active ? ' Hide' : ' Show'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(r)} style={btnStyle('transparent', '#F09595', '#791F1F')} title="Delete"></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #791F1F', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#F09595', fontSize: '16px', margin: '0 0 8px' }}>Delete Resource?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: '#f59e0b' }}>"{showDeleteConfirm.name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => deleteResource(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#791F1F', border: 'none', color: '#F09595', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
