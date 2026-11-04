import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

const TABS = [
  { id: 'all', label: 'All Users', icon: '' },
  { id: 'premium', label: 'Premium', icon: '' },
  { id: 'company', label: 'Company', icon: '' },
  { id: 'free', label: 'Free', icon: '' },
  { id: 'pending', label: 'Pending', icon: '⏳' },
]

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1d5c38;color:#6ee7b7;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid #3b7a5a;white-space:nowrap'
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function UserManagement() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('users')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [expandedUser, setExpandedUser] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(null)
  const [showPasswordReset, setShowPasswordReset] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [savingRole, setSavingRole] = useState(false)
  const [showGrantPremium, setShowGrantPremium] = useState(null)
  const [showRevokePremium, setShowRevokePremium] = useState(null)

  const fetchEmail = async (userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_email', { user_id: userId })
      if (error) throw error
      return data || null
    } catch (err) {
      return null
    }
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      const userList = data || []

      if (userList.length > 0) {
        const usersWithEmails = await Promise.all(
          userList.map(async (user) => {
            const email = await fetchEmail(user.id)
            return { ...user, email }
          })
        )
        setUsers(usersWithEmails)
      } else {
        setUsers([])
      }
    } catch (err) {
      setError('Failed to load users.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleStatus = async (userId, currentStatus) => {
    setActionLoading(userId)
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended'
    try {
      const { error: statusError } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId)
      if (statusError) throw statusError
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u))
      showToast(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
    } catch (err) { showToast('Failed to update.') }
    setActionLoading(null)
    setShowSuspendConfirm(null)
  }

  const handleRoleChange = async (userId) => {
    if (!newRole) return
    setSavingRole(true)
    try {
      const { error: roleError } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
      if (roleError) throw roleError
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      showToast(`Role changed to ${newRole}.`)
      setEditingRole(null)
    } catch (err) { showToast('Failed to update role.') }
    setSavingRole(false)
  }

  const deleteUser = async (userId) => {
    setActionLoading(userId)
    try {
      const { error: delError } = await supabase.from('profiles').delete().eq('id', userId)
      if (delError) throw delError
      setUsers(prev => prev.filter(u => u.id !== userId))
      showToast('User deleted permanently.')
    } catch (err) { showToast('Delete failed.') }
    setActionLoading(null)
    setShowDeleteConfirm(null)
  }

  const handleAdminResetPassword = async () => {
    if (!showPasswordReset || !newPassword || newPassword.length < 8) {
      showToast('Password must be at least 8 characters.')
      return
    }
    setResetLoading(true)
    try {
      const { data, error: resetError } = await supabase.functions.invoke('admin-reset-password', {
        body: { action: 'reset-password', userId: showPasswordReset.id, newPassword }
      })
      if (resetError || data?.error) throw new Error(data?.error || resetError?.message)
      showToast(`Password updated for ${showPasswordReset.full_name || 'user'}.`)
      setShowPasswordReset(null)
      setNewPassword('')
      setShowNewPassword(false)
    } catch (err) {
      showToast('Failed: ' + (err.message || 'Unknown error'))
    }
    setResetLoading(false)
  }

  const grantPremium = async (userId) => {
    setActionLoading(userId)
    try {
      const { error } = await supabase.from('profiles').update({
        subscription_plan: 'premium',
        plan_type: 'individual',
        subscription_status: 'active'
      }).eq('id', userId)
      if (error) throw error
      setUsers(prev => prev.map(u => u.id === userId ? { 
        ...u, subscription_plan: 'premium', plan_type: 'individual', subscription_status: 'active' 
      } : u))
      showToast('Premium access granted!')
    } catch (err) { showToast('Failed to grant premium.', 'error') }
    setActionLoading(null)
    setShowGrantPremium(null)
  }

  const revokePremium = async (userId) => {
    setActionLoading(userId)
    try {
      const { error } = await supabase.from('profiles').update({
        subscription_plan: 'free',
        plan_type: 'individual',
        subscription_status: 'inactive'
      }).eq('id', userId)
      if (error) throw error
      setUsers(prev => prev.map(u => u.id === userId ? { 
        ...u, subscription_plan: 'free', plan_type: 'individual', subscription_status: 'inactive' 
      } : u))
      showToast('Premium access revoked.')
    } catch (err) { showToast('Failed to revoke.', 'error') }
    setActionLoading(null)
    setShowRevokePremium(null)
  }

  const handleExportCSV = () => {
    const headers = ['Name', 'Username', 'Email', 'Phone', 'Role', 'Plan', 'Plan Type', 'Risk', 'Streak', 'Status', 'Joined']
    const rows = users.map(u => [
      u.full_name || '', u.username || '', u.email || '', u.phone || '',
      u.role || 'user', u.subscription_plan || 'free', u.plan_type || 'individual',
      u.risk_level || 'low', u.streak_days || 0, u.status || 'active', fmt(u.created_at)
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'precious-users-' + new Date().toISOString().split('T')[0] + '.csv'
    a.click(); URL.revokeObjectURL(url)
    showToast('CSV exported!')
  }

  const filtered = users.filter(u => {
    if (activeTab === 'users') {
      const matchesSearch = !search ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.phone || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase())
      const matchesFilter = filter === 'all' || (u.risk_level || '').toLowerCase() === filter
      return matchesSearch && matchesFilter
    } else {
      const matchesSearch = !search ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase())
      if (paymentFilter === 'all') return matchesSearch
      if (paymentFilter === 'premium') return matchesSearch && u.subscription_plan === 'premium' && u.plan_type !== 'company'
      if (paymentFilter === 'company') return matchesSearch && u.plan_type === 'company'
      if (paymentFilter === 'free') return matchesSearch && (!u.subscription_plan || u.subscription_plan === 'free') && u.plan_type !== 'company'
      if (paymentFilter === 'pending') return matchesSearch && u.subscription_status === 'pending'
      return matchesSearch
    }
  })

  const paymentStats = useMemo(() => ({
    all: users.length,
    premium: users.filter(u => u.subscription_plan === 'premium' && u.plan_type !== 'company').length,
    company: users.filter(u => u.plan_type === 'company').length,
    free: users.filter(u => (!u.subscription_plan || u.subscription_plan === 'free') && u.plan_type !== 'company').length,
    pending: users.filter(u => u.subscription_status === 'pending').length,
  }), [users])

  const highRiskCount = users.filter(u => u.risk_level === 'high').length
  const suspendedCount = users.filter(u => u.status === 'suspended').length

  const riskBadge = (risk) => {
    if (risk === 'high') return { bg: '#791F1F', color: '#F09595', border: '#F09595', label: 'High' }
    if (risk === 'medium') return { bg: '#633806', color: '#FAC775', border: '#FAC775', label: 'Medium' }
    return { bg: '#0a3d22', color: '#6ee7b7', border: '#6ee7b7', label: 'Low' }
  }

  const planBadge = (plan, planType) => {
    if (planType === 'company') return { bg: '#633806', color: '#f59e0b', border: '#f59e0b', label: 'Company' }
    if (plan === 'premium') return { bg: '#0a3d22', color: '#f59e0b', border: '#f59e0b', label: 'Premium' }
    return { bg: 'transparent', color: '#3b7a5a', border: '#0a3d22', label: 'Free' }
  }

  const btn = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: '1px solid ' + (border || bg),
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <p style={{ color: '#FAC775' }}>Loading users...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#F09595', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchUsers} style={btn('transparent', '#F09595', '#F09595')}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#041f13', borderBottom: '2px solid #f59e0b', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b', fontFamily: "'Inter', sans-serif", margin: 0 }}>
              {activeTab === 'users' ? 'User Management' : 'Payment Management'}
            </h1>
            <p style={{ fontSize: '12px', color: '#FAC775', margin: '2px 0 0' }}>
              {activeTab === 'users' 
                ? `${users.length} total  ${highRiskCount} high risk  ${suspendedCount} suspended`
                : `${paymentStats.premium} premium  ${paymentStats.company} company  ${paymentStats.free} free  ${paymentStats.pending} pending`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={handleExportCSV} style={btn('transparent', '#6ee7b7', '#6ee7b7')}>Export CSV</button>
            <button onClick={fetchUsers} style={btn('transparent', '#FAC775', '#FAC775')}>Refresh</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Main Tabs: Users | Payments */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: '#062616', borderRadius: '12px', padding: '4px', border: '1px solid #0a3d22', overflowX: 'auto' }}>
            <button onClick={() => { setActiveTab('users'); setSearch(''); setFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'users' ? '#633806' : 'transparent', color: activeTab === 'users' ? '#f59e0b' : '#3b7a5a', fontSize: '12px', fontWeight: activeTab === 'users' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              Users
            </button>
            <button onClick={() => { setActiveTab('payments'); setSearch(''); setPaymentFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'payments' ? '#633806' : 'transparent', color: activeTab === 'payments' ? '#f59e0b' : '#3b7a5a', fontSize: '12px', fontWeight: activeTab === 'payments' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              Payments
            </button>
          </div>

          {/* Users Tab */}
          {activeTab === 'users' && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name, email, username, or phone..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: '#062616', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all', 'high', 'medium', 'low'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      style={{ padding: '6px 14px', borderRadius: '100px', border: '1px solid ' + (filter === f ? '#f59e0b' : '#0a3d22'), background: filter === f ? '#633806' : 'transparent', color: filter === f ? '#f59e0b' : '#3b7a5a', fontSize: '12px', fontWeight: filter === f ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + ' Risk'}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>{'\u{1F465}'}</span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>{search ? 'No users match your search.' : 'No users found.'}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filtered.map(u => {
                    const risk = riskBadge(u.risk_level)
                    const plan = planBadge(u.subscription_plan, u.plan_type)
                    const isExpanded = expandedUser === u.id
                    const isSuspended = u.status === 'suspended'
                    const hasPartner = u.accountability_partner_name || u.accountability_partner_phone

                    return (
                      <div key={u.id} style={{ background: '#062616', border: '1px solid ' + (isSuspended ? '#791F1F' : '#0a3d22'), borderRadius: '12px', padding: '16px', opacity: isSuspended ? 0.7 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <span style={{ color: '#e2f5ec', fontSize: '14px', fontWeight: 600 }}>
                                {u.full_name || 'Unnamed'}
                                {u.username && <span style={{ color: '#3b7a5a', fontSize: '12px', fontWeight: 400 }}> @{u.username}</span>}
                              </span>
                              <span style={{ background: risk.bg, color: risk.color, border: '1px solid ' + risk.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{risk.label} Risk</span>
                              <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                              {u.role !== 'user' && (
                                <span style={{ background: '#633806', color: '#f59e0b', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>
                                  {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                </span>
                              )}
                              {isSuspended && (
                                <span style={{ background: '#791F1F', color: '#F09595', border: '1px solid #F09595', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>Suspended</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: '#6ee7b7', fontSize: '11px' }}>
                                {'\u{2709}'} {u.email || 'No email'}
                                {u.email && <button onClick={() => { navigator.clipboard.writeText(u.email); showToast('Email copied!') }} style={{ background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }} title="Copy email"></button>}
                              </span>
                              <span style={{ color: '#6ee7b7', fontSize: '11px' }}>{'\u{1F4DE}'} {u.phone || 'No phone'}</span>
                              <span style={{ color: '#f59e0b', fontSize: '11px' }}>{'\u{1F525}'} {u.streak_days || 0}d streak</span>
                              <span style={{ color: '#3b7a5a', fontSize: '11px' }}>Joined {fmt(u.created_at)}</span>
                            </div>

                            {hasPartner && (
                              <div style={{ background: '#0a0a0a', border: '1px solid #6ee7b733', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#6ee7b7', fontSize: '11px', fontWeight: 600 }}>{'\u{1F91D}'} Partner:</span>
                                {u.accountability_partner_name && <span style={{ color: '#e2f5ec', fontSize: '12px' }}>{u.accountability_partner_name}</span>}
                                {u.accountability_partner_phone && (
                                  <span style={{ color: '#3b7a5a', fontSize: '11px' }}>
                                    {'\u{1F4DE}'} {u.accountability_partner_phone}
                                    <button onClick={() => { navigator.clipboard.writeText(u.accountability_partner_phone); showToast('Partner phone copied!') }} style={{ background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }}></button>
                                  </span>
                                )}
                              </div>
                            )}

                            {u.report_password && (
                              <div style={{ background: '#0a0a0a', border: '1px solid #f59e0b33', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 600 }}>{'\u{1F510}'} Report Password:</span>
                                <code style={{ background: '#041f13', padding: '4px 10px', borderRadius: '4px', color: '#f59e0b', fontSize: '12px', fontFamily: 'monospace', letterSpacing: '1px', userSelect: 'all' }}>{u.report_password}</code>
                                <button onClick={() => { navigator.clipboard.writeText(u.report_password); showToast('Password copied!') }} style={{ background: 'transparent', border: 'none', color: '#6ee7b7', fontSize: '12px', cursor: 'pointer' }}>Copy</button>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <button onClick={() => setExpandedUser(isExpanded ? null : u.id)} style={btn('transparent', '#6ee7b7', '#0a3d22')}>{isExpanded ? 'Collapse' : 'Expand'}</button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '14px', borderTop: '1px solid #0a3d22', paddingTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => setShowSuspendConfirm(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', isSuspended ? '#6ee7b7' : '#FAC775', isSuspended ? '#6ee7b7' : '#FAC775')}>
                              {actionLoading === u.id ? '...' : isSuspended ? 'Reactivate' : 'Suspend'}
                            </button>
                            <button onClick={() => { setShowPasswordReset(u); setNewPassword(''); setShowNewPassword(false) }}
                              style={btn('transparent', '#6ee7b7', '#6ee7b7')}>Set Password</button>
                            {editingRole === u.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                                  style={{ padding: '6px 10px', borderRadius: '8px', background: '#041f13', border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '12px', fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}>
                                  <option value="">Select...</option>
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                                  <option value="super_admin">Super Admin</option>
                                </select>
                                <button onClick={() => handleRoleChange(u.id)} disabled={savingRole || !newRole} style={btn('#f59e0b', '#041f13', '#f59e0b')}>{savingRole ? '...' : 'Save'}</button>
                                <button onClick={() => setEditingRole(null)} style={btn('transparent', '#3b7a5a', '#0a3d22')}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingRole(u.id); setNewRole(u.role || 'user') }} style={btn('transparent', '#FAC775', '#FAC775')}>Change Role</button>
                            )}
                            <button onClick={() => setShowDeleteConfirm(u)} style={btn('transparent', '#F09595', '#791F1F')}>Delete</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: '#062616', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setPaymentFilter(tab.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '100px', border: '1px solid ' + (paymentFilter === tab.id ? '#f59e0b' : '#0a3d22'),
                      background: paymentFilter === tab.id ? '#633806' : 'transparent',
                      color: paymentFilter === tab.id ? '#f59e0b' : '#3b7a5a',
                      fontSize: '12px', fontWeight: paymentFilter === tab.id ? 600 : 400,
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                    }}>
                    {tab.icon} {tab.label} ({paymentStats[tab.id] || 0})
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '1rem' }}>
                {[
                  { label: 'Premium Users', value: paymentStats.premium, icon: '', color: '#f59e0b' },
                  { label: 'Company Users', value: paymentStats.company, icon: '', color: '#f59e0b' },
                  { label: 'Free Users', value: paymentStats.free, icon: '', color: '#6ee7b7' },
                  { label: 'Pending', value: paymentStats.pending, icon: '⏳', color: '#FAC775' },
                ].map((s, i) => (
                  <div key={i} style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>{s.icon}</span>
                    <span style={{ display: 'block', fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</span>
                    <span style={{ fontSize: '10px', color: '#3b7a5a' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#3b7a5a', background: '#062616', borderRadius: '12px', border: '1px solid #0a3d22' }}>
                  <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                  <p style={{ color: '#6ee7b7', fontSize: '14px' }}>No users match this filter.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(u => {
                    const plan = planBadge(u.subscription_plan, u.plan_type)
                    return (
                      <div key={u.id} style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500 }}>
                            {u.full_name || 'Unnamed'}
                            <span style={{ color: '#3b7a5a', fontSize: '11px', marginLeft: '4px' }}>{u.email || ''}</span>
                          </span>
                          <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                          {u.subscription_status === 'pending' && (
                            <span style={{ background: '#633806', color: '#FAC775', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid #FAC775' }}>Pending</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(!u.subscription_plan || u.subscription_plan === 'free') && u.plan_type !== 'company' && (
                            <button onClick={() => setShowGrantPremium(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', '#6ee7b7', '#6ee7b7')}>
                              {actionLoading === u.id ? '...' : 'Grant Premium'}
                            </button>
                          )}
                          {(u.subscription_plan === 'premium' && u.plan_type !== 'company') && (
                            <button onClick={() => setShowRevokePremium(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', '#FAC775', '#FAC775')}>
                              {actionLoading === u.id ? '...' : 'Revoke'}
                            </button>
                          )}
                          {u.plan_type === 'company' && (
                            <span style={{ color: '#3b7a5a', fontSize: '11px' }}>Managed by employer</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Suspend Modal */}
      {showSuspendConfirm && (
        <div onClick={() => setShowSuspendConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid ' + (showSuspendConfirm.status === 'suspended' ? '#6ee7b7' : '#FAC775'), maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{showSuspendConfirm.status === 'suspended' ? '\u{25B6}' : '\u{23F8}'}</span>
            <h3 style={{ color: showSuspendConfirm.status === 'suspended' ? '#6ee7b7' : '#FAC775', fontSize: '16px', margin: '0 0 8px' }}>
              {showSuspendConfirm.status === 'suspended' ? 'Reactivate User?' : 'Suspend User?'}
            </h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px' }}>
              <strong style={{ color: '#f59e0b' }}>"{showSuspendConfirm.full_name || showSuspendConfirm.username || 'User'}"</strong> will be {showSuspendConfirm.status === 'suspended' ? 'reactivated' : 'suspended'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSuspendConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => toggleStatus(showSuspendConfirm.id, showSuspendConfirm.status || 'active')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showSuspendConfirm.status === 'suspended' ? '#0a3d22' : '#633806', border: 'none', color: showSuspendConfirm.status === 'suspended' ? '#6ee7b7' : '#f59e0b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {showSuspendConfirm.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #791F1F', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{'\u{1F5D1}'}</span>
            <h3 style={{ color: '#F09595', fontSize: '16px', margin: '0 0 8px' }}>Delete User?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px' }}>
              Permanently delete <strong style={{ color: '#f59e0b' }}>"{showDeleteConfirm.full_name || 'User'}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => deleteUser(showDeleteConfirm.id)} disabled={actionLoading === showDeleteConfirm.id} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#791F1F', border: 'none', color: '#F09595', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {actionLoading === showDeleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {showPasswordReset && (
        <div onClick={() => { setShowPasswordReset(null); setNewPassword(''); setShowNewPassword(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #6ee7b7', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{'\u{1F511}'}</span>
            <h3 style={{ color: '#6ee7b7', fontSize: '16px', margin: '0 0 4px' }}>Set New Password</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '16px' }}>
              For <strong style={{ color: '#f59e0b' }}>{showPasswordReset.full_name || showPasswordReset.username || 'User'}</strong>
              {showPasswordReset.email && <span style={{ display: 'block', color: '#3b7a5a', fontSize: '11px', marginTop: '4px' }}>{showPasswordReset.email}</span>}
            </p>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input type={showNewPassword ? 'text' : 'password'} placeholder="Enter new password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 80px 10px 14px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && handleAdminResetPassword()} autoFocus />
              <button onClick={() => setShowNewPassword(!showNewPassword)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}
                title={showNewPassword ? 'Hide password' : 'Show password'}>
                {showNewPassword ? '' : ''}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowPasswordReset(null); setNewPassword(''); setShowNewPassword(false) }} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={handleAdminResetPassword} disabled={resetLoading || newPassword.length < 8} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: newPassword.length >= 8 ? '#f59e0b' : '#0a3d22', border: 'none', color: newPassword.length >= 8 ? '#041f13' : '#3b7a5a', fontSize: '13px', fontWeight: 600, cursor: newPassword.length >= 8 ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>
                {resetLoading ? '...' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Premium Modal */}
      {showGrantPremium && (
        <div onClick={() => setShowGrantPremium(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #6ee7b7', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#6ee7b7', fontSize: '16px', margin: '0 0 8px' }}>Grant Premium Access?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px' }}>
              Give <strong style={{ color: '#f59e0b' }}>"{showGrantPremium.full_name || 'User'}"</strong> free Premium access? This can be revoked later.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowGrantPremium(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => grantPremium(showGrantPremium.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#f59e0b', border: 'none', color: '#041f13', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Grant Premium</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Premium Modal */}
      {showRevokePremium && (
        <div onClick={() => setShowRevokePremium(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #FAC775', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>⬇</span>
            <h3 style={{ color: '#FAC775', fontSize: '16px', margin: '0 0 8px' }}>Revoke Premium Access?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px' }}>
              <strong style={{ color: '#f59e0b' }}>"{showRevokePremium.full_name || 'User'}"</strong> will be moved back to the Free plan.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowRevokePremium(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => revokePremium(showRevokePremium.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#633806', border: 'none', color: '#f59e0b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Revoke</button>
            </div>
          </div>
        </div>
      )}

      <style>{'@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }'}</style>
    </div>
  )
}
