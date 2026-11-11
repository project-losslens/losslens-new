import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import { BrandLoader } from '../../components/Brand'

//  Constants
const SORT_OPTIONS = { NEWEST: 'newest', NAME: 'name', ACTIVE: 'active' }


export default function ManageGroups() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [saving, setSaving] = useState(false)
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
      toast.success(editingGroup ? 'Group updated!' : 'Group created!')
      setShowForm(false)
      fetchGroups()
    } catch (err) { toast.error('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (g) => {
    const newActive = !g.active
    //  Optimistic update
    setGroups(prev => prev.map(item => item.id === g.id ? { ...item, active: newActive } : item))
    const { error: toggleError } = await supabase.from('groups').update({ active: newActive }).eq('id', g.id)
    if (toggleError) {
      setGroups(prev => prev.map(item => item.id === g.id ? { ...item, active: !newActive } : item))
      toast.error('Update failed.')
    } else {
      toast.success(newActive ? 'Group activated.' : 'Group deactivated.')
    }
  }

  const handleDelete = async (id) => {
    setDeleting(true)
    const { error: delError } = await supabase.from('groups').delete().eq('id', id)
    if (delError) {
      toast.error('Delete failed.')
    } else {
      setGroups(prev => prev.filter(g => g.id !== id))
      toast.success('Group deleted.')
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

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)', boxSizing: 'border-box', outline: 'none' }
  const btnStyle = (bg, color, border) => ({ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border || bg}`, background: bg, color, fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--info)', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
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
            <button onClick={fetchGroups} style={btnStyle('transparent', 'var(--text)', 'var(--text)')}>Retry</button>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)', margin: 0 }}> Manage Groups</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{groups.length} total  · {activeCount} active</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchGroups} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }} aria-label="Refresh groups"></button>
            <button onClick={openCreate} style={{ padding: '8px 18px', borderRadius: '100px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}> New Group</button>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowForm(false)} />
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 1.25rem' }}>{editingGroup ? ' Edit Group' : ' New Group'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Group Name *</label>
                  <input type="text" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormErrors(p => ({ ...p, name: '' })) }} style={{ ...inputStyle, borderColor: formErrors.name ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. Nairobi Recovery Circle" />
                  {formErrors.name && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{formErrors.name}</span>}
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
                    <NumberField value={form.max_members} onChange={(max_members) => { setForm((current) => ({ ...current, max_members: max_members ?? '' })); setFormErrors((current) => ({ ...current, max_members: '' })) }} wrapperStyle={{ ...inputStyle, borderColor: formErrors.max_members ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} placeholder="e.g. 20" inputMode="numeric" min={1} step={1} />
                    {formErrors.max_members && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{formErrors.max_members}</span>}
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
                  <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Active</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowForm(false)} style={btnStyle('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={btnStyle('var(--primary)', 'var(--bg)', 'var(--primary)')}>{saving ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}</button>
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
              <AppIcon name="users" size={48} style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--primary)', fontSize: '14px' }}>{debouncedSearch ? 'No groups match your search.' : 'No groups yet. Create your first support group.'}</p>
              {debouncedSearch && <button onClick={() => setSearchQuery('')} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Clear search</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredGroups.map(g => (
                <div key={g.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', padding: '16px', opacity: g.active ? 1 : 0.7, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{g.name}</span>
                        <span style={{ background: g.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)', color: g.active ? 'var(--primary)' : 'var(--text)', border: `1px solid ${g.active ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{g.active ? 'Active' : 'Inactive'}</span>
                        {g.category && <span style={{ background: 'var(--bg)', color: 'var(--info)', border: '1px solid rgba(45,212,191,0.15)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{g.category}</span>}
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
                      <button onClick={() => openEdit(g)} style={btnStyle('transparent', 'var(--info)', 'var(--info)')} title="Edit"></button>
                      <button onClick={() => toggleActive(g)} style={btnStyle('transparent', g.active ? 'var(--info)' : 'var(--primary)', g.active ? 'var(--info)' : 'var(--primary)')} title={g.active ? 'Deactivate' : 'Activate'}>
                        {g.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(g)} style={btnStyle('transparent', 'var(--text)', 'rgba(255,255,255,0.08)')} title="Delete"></button>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowDeleteConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="alert" size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Delete Group?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: 'var(--primary)' }}>"{showDeleteConfirm.name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => handleDelete(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
