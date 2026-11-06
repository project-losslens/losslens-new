import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

//  Constants
const SORT_OPTIONS = { NEWEST: 'newest', NAME: 'name', ACTIVE: 'active' }

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function ManageGroups() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.NEWEST)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    name: '', facilitator: '', meets: '', location: '',
    max_members: '', description: '', active: true, category: ''
  })

  const displayToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  //  Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('groups').select('*').order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      setGroups(data || [])
    } catch (err) {
      console.error('Groups fetch error:', err)
      setError('Failed to load groups.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const openCreate = () => {
    setEditingGroup(null)
    setForm({ name: '', facilitator: '', meets: '', location: '', max_members: '', description: '', active: true, category: '' })
    setFormErrors({})
    setShowForm(true)
  }

  const openEdit = (g) => {
    setEditingGroup(g)
    setForm({
      name: g.name || '', facilitator: g.facilitator || '',
      meets: g.meets || '', location: g.location || '',
      max_members: g.max_members || '', description: g.description || '',
      active: g.active, category: g.category || '',
    })
    setFormErrors({})
    setShowForm(true)
  }

  //  Validate form
  const validateForm = () => {
    const errors = {}
    if (!form.name.trim()) errors.name = 'Group name is required'
    if (form.max_members && (isNaN(parseInt(form.max_members)) || parseInt(form.max_members) < 1)) errors.max_members = 'Enter a valid number'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return
    setSaving(true)
    const payload = {
      ...form,
      max_members: form.max_members ? parseInt(form.max_members) : null,
    }
    try {
      const { error: saveError } = editingGroup
        ? await supabase.from('groups').update(payload).eq('id', editingGroup.id)
        : await supabase.from('groups').insert(payload)
      if (saveError) throw saveError
      displayToast(editingGroup ? 'Group updated!' : 'Group created!')
      setShowForm(false)
      fetchGroups()
    } catch (err) { displayToast('Save failed: ' + err.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleActive = async (g) => {
    const newActive = !g.active
    //  Optimistic update
    setGroups(prev => prev.map(item => item.id === g.id ? { ...item, active: newActive } : item))
    const { error: toggleError } = await supabase.from('groups').update({ active: newActive }).eq('id', g.id)
    if (toggleError) {
      setGroups(prev => prev.map(item => item.id === g.id ? { ...item, active: !newActive } : item))
      displayToast('Update failed.', 'error')
    } else {
      displayToast(newActive ? 'Group activated.' : 'Group deactivated.')
    }
  }

  const handleDelete = async (id) => {
    setDeleting(true)
    const { error: delError } = await supabase.from('groups').delete().eq('id', id)
    if (delError) {
      displayToast('Delete failed.', 'error')
    } else {
      setGroups(prev => prev.filter(g => g.id !== id))
      displayToast('Group deleted.')
    }
    setDeleting(false)
    setShowDeleteConfirm(null)
  }

  //  Memoized filtered + sorted
  const { filteredGroups, activeCount } = useMemo(() => {
    let filtered = groups.filter(g =>
      !debouncedSearch ||
      g.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      g.facilitator?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      g.location?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      g.description?.toLowerCase().includes(debouncedSearch.toLowerCase())
    )

    // Sort
    if (sortBy === SORT_OPTIONS.NAME) filtered = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === SORT_OPTIONS.ACTIVE) filtered = [...filtered].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))

    return { filteredGroups: filtered, activeCount: groups.filter(g => g.active).length }
  }, [groups, debouncedSearch, sortBy])

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '13px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7DBDEE', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading groups...</p>
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
            <button onClick={fetchGroups} style={btnStyle('transparent', '#FFFFFF', '#FFFFFF')}>Retry</button>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Manage Groups</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.08)', margin: '2px 0 0' }}>{groups.length} total  · {activeCount} active</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchGroups} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }} aria-label="Refresh groups"></button>
            <button onClick={openCreate} style={{ padding: '8px 18px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> New Group</button>
          </div>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? 'rgba(255,255,255,0.08)' : '#7DBDEE', color: toast.type === 'error' ? '#FFFFFF' : '#2DD4BF', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ color: '#2DD4BF', fontSize: '16px', margin: '0 0 1.25rem' }}>{editingGroup ? ' Edit Group' : ' New Group'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Group Name *</label>
                  <input type="text" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormErrors(p => ({ ...p, name: '' })) }} style={{ ...inputStyle, borderColor: formErrors.name ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. Nairobi Recovery Circle" />
                  {formErrors.name && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{formErrors.name}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Facilitator</label>
                    <input type="text" value={form.facilitator} onChange={e => setForm(p => ({ ...p, facilitator: e.target.value }))} style={inputStyle} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Category</label>
                    <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">General</option>
                      <option value="Mens">Men's Group</option>
                      <option value="Womens">Women's Group</option>
                      <option value="Youth">Youth</option>
                      <option value="Family">Family</option>
                      <option value="Online">Online</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Meeting Schedule</label>
                    <input type="text" value={form.meets} onChange={e => setForm(p => ({ ...p, meets: e.target.value }))} style={inputStyle} placeholder="e.g. Every Saturday 2pm" />
                  </div>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Max Members</label>
                    <input type="number" value={form.max_members} onChange={e => { setForm(p => ({ ...p, max_members: e.target.value })); setFormErrors(p => ({ ...p, max_members: '' })) }} style={{ ...inputStyle, borderColor: formErrors.max_members ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. 20" min="1" />
                    {formErrors.max_members && <span style={{ fontSize: '11px', color: '#FFFFFF' }}>{formErrors.max_members}</span>}
                  </div>
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Location / Link</label>
                  <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={inputStyle} placeholder="Zoom link or physical address" />
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What this group is about..." />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#2DD4BF', width: '16px', height: '16px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Active</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowForm(false)} style={btnStyle('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={btnStyle('#2DD4BF', '#0B1220', '#2DD4BF')}>{saving ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <input type="text" placeholder=" Search groups..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, width: '240px', paddingRight: '32px', borderRadius: '100px' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px', padding: '4px 6px' }}></button>}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '120px', cursor: 'pointer', borderRadius: '100px' }}>
              <option value={SORT_OPTIONS.NEWEST}>Newest</option>
              <option value={SORT_OPTIONS.NAME}>Name</option>
              <option value={SORT_OPTIONS.ACTIVE}>Active First</option>
            </select>
          </div>

          {filteredGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>{debouncedSearch ? 'No groups match your search.' : 'No groups yet. Create your first support group.'}</p>
              {debouncedSearch && <button onClick={() => setSearchQuery('')} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Clear search</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredGroups.map(g => (
                <div key={g.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', padding: '16px', opacity: g.active ? 1 : 0.7, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2DD4BF'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>{g.name}</span>
                        <span style={{ background: g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)', color: g.active ? '#2DD4BF' : '#FFFFFF', border: `1px solid ${g.active ? '#2DD4BF' : 'rgba(255,255,255,0.08)'}`, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{g.active ? 'Active' : 'Inactive'}</span>
                        {g.category && <span style={{ background: '#0B1220', color: '#7DBDEE', border: '1px solid rgba(45,212,191,0.15)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{g.category}</span>}
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px' }}>
                         {g.facilitator || 'No facilitator'}  ·  {g.meets || 'Schedule TBD'}
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px' }}>
                         {g.location || 'Location TBD'}  ·  {g.max_members ? `${g.max_members} max` : 'Unlimited'}
                      </p>
                      {g.description && (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '4px 0 0', lineHeight: '1.4' }}>
                          {g.description.length > 120 ? (
                            <span title={g.description}>{g.description.substring(0, 120)}"¦</span>
                          ) : g.description}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <button onClick={() => openEdit(g)} style={btnStyle('transparent', '#7DBDEE', '#7DBDEE')} title="Edit"></button>
                      <button onClick={() => toggleActive(g)} style={btnStyle('transparent', g.active ? '#7DBDEE' : '#2DD4BF', g.active ? '#7DBDEE' : '#2DD4BF')} title={g.active ? 'Deactivate' : 'Activate'}>
                        {g.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(g)} style={btnStyle('transparent', '#FFFFFF', 'rgba(255,255,255,0.08)')} title="Delete"></button>
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
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#FFFFFF', fontSize: '16px', margin: '0 0 8px' }}>Delete Group?</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: '#2DD4BF' }}>"{showDeleteConfirm.name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => handleDelete(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
