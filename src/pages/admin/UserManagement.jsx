import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
  toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--info);color:var(--primary);padding:10px 20px;border-radius:100px;font-size:13px;z-index: var(--z-toast);box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap'
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
    if (risk === 'high') return { bg: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: 'var(--text)', label: 'High' }
    if (risk === 'medium') return { bg: 'rgba(45,212,191,0.15)', color: 'var(--info)', border: 'var(--info)', label: 'Medium' }
    return { bg: 'rgba(255,255,255,0.12)', color: 'var(--primary)', border: 'var(--primary)', label: 'Low' }
  }

  const planBadge = (plan, planType) => {
    if (planType === 'company') return { bg: 'rgba(45,212,191,0.15)', color: 'var(--primary)', border: 'var(--primary)', label: 'Company' }
    if (plan === 'premium') return { bg: 'rgba(255,255,255,0.12)', color: 'var(--primary)', border: 'var(--primary)', label: 'Premium' }
    return { bg: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.12)', label: 'Free' }
  }

  const btn = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: '1px solid ' + (border || bg),
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <p style={{ color: 'var(--info)' }}>Loading users...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchUsers} style={btn('transparent', 'var(--text)', 'var(--text)')}>Retry</button>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: "'Inter', sans-serif", margin: 0 }}>
              {activeTab === 'users' ? 'User Management' : 'Payment Management'}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>
              {activeTab === 'users'
                ? `${users.length} total  ${highRiskCount} high risk  ${suspendedCount} suspended`
                : `${paymentStats.premium} premium  ${paymentStats.company} company  ${paymentStats.free} free  ${paymentStats.pending} pending`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={handleExportCSV} style={btn('transparent', 'var(--primary)', 'var(--primary)')}>Export CSV</button>
            <button onClick={fetchUsers} style={btn('transparent', 'var(--info)', 'var(--info)')}>Refresh</button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Main Tabs: Users | Payments */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', overflowX: 'auto' }}>
            <button onClick={() => { setActiveTab('users'); setSearch(''); setFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'users' ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeTab === 'users' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'users' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              Users
            </button>
            <button onClick={() => { setActiveTab('payments'); setSearch(''); setPaymentFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'payments' ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeTab === 'payments' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'payments' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              Payments
            </button>
          </div>

          {/* Users Tab */}
          {activeTab === 'users' && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name, email, username, or phone..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all', 'high', 'medium', 'low'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      style={{ padding: '6px 14px', borderRadius: '100px', border: '1px solid ' + (filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.12)'), background: filter === f ? 'rgba(45,212,191,0.15)' : 'transparent', color: filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: filter === f ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + ' Risk'}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>{'\u{1F465}'}</span>
                  <p style={{ color: 'var(--primary)', fontSize: '14px' }}>{search ? 'No users match your search.' : 'No users found.'}</p>
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
                      <div key={u.id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid ' + (isSuspended ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'), borderRadius: '12px', padding: '16px', opacity: isSuspended ? 0.7 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>
                                {u.full_name || 'Unnamed'}
                                {u.username && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 400 }}> @{u.username}</span>}
                              </span>
                              <span style={{ background: risk.bg, color: risk.color, border: '1px solid ' + risk.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{risk.label} Risk</span>
                              <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                              {u.role !== 'user' && (
                                <span style={{ background: 'rgba(45,212,191,0.15)', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>
                                  {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                </span>
                              )}
                              {isSuspended && (
                                <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--text)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>Suspended</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}>
                                {'\u{2709}'} {u.email || 'No email'}
                                {u.email && <button onClick={() => { navigator.clipboard.writeText(u.email); showToast('Email copied!') }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }} title="Copy email"></button>}
                              </span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}>{'\u{1F4DE}'} {u.phone || 'No phone'}</span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}>{'\u{1F525}'} {u.streak_days || 0}d streak</span>
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Joined {fmt(u.created_at)}</span>
                            </div>

                            {hasPartner && (
                              <div style={{ background: 'var(--bg)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 600 }}>{'\u{1F91D}'} Partner:</span>
                                {u.accountability_partner_name && <span style={{ color: 'var(--text)', fontSize: '12px' }}>{u.accountability_partner_name}</span>}
                                {u.accountability_partner_phone && (
                                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                                    {'\u{1F4DE}'} {u.accountability_partner_phone}
                                    <button onClick={() => { navigator.clipboard.writeText(u.accountability_partner_phone); showToast('Partner phone copied!') }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }}></button>
                                  </span>
                                )}
                              </div>
                            )}

                            {u.report_password && (
                              <div style={{ background: 'var(--bg)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 600 }}>{'\u{1F510}'} Report Password:</span>
                                <code style={{ background: 'var(--bg)', padding: '4px 10px', borderRadius: '4px', color: 'var(--primary)', fontSize: '12px', fontFamily: 'monospace', letterSpacing: '1px', userSelect: 'all' }}>{u.report_password}</code>
                                <button onClick={() => { navigator.clipboard.writeText(u.report_password); showToast('Password copied!') }} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer' }}>Copy</button>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <button onClick={() => setExpandedUser(isExpanded ? null : u.id)} style={btn('transparent', 'var(--primary)', 'rgba(255,255,255,0.12)')}>{isExpanded ? 'Collapse' : 'Expand'}</button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => setShowSuspendConfirm(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', isSuspended ? 'var(--primary)' : 'var(--info)', isSuspended ? 'var(--primary)' : 'var(--info)')}>
                              {actionLoading === u.id ? '...' : isSuspended ? 'Reactivate' : 'Suspend'}
                            </button>
                            <button onClick={() => { setShowPasswordReset(u); setNewPassword(''); setShowNewPassword(false) }}
                              style={btn('transparent', 'var(--primary)', 'var(--primary)')}>Set Password</button>
                            {editingRole === u.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                                  style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '12px', fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}>
                                  <option value="">Select...</option>
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                                  <option value="super_admin">Super Admin</option>
                                </select>
                                <button onClick={() => handleRoleChange(u.id)} disabled={savingRole || !newRole} style={btn('var(--primary)', 'var(--bg)', 'var(--primary)')}>{savingRole ? '...' : 'Save'}</button>
                                <button onClick={() => setEditingRole(null)} style={btn('transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingRole(u.id); setNewRole(u.role || 'user') }} style={btn('transparent', 'var(--info)', 'var(--info)')}>Change Role</button>
                            )}
                            <button onClick={() => setShowDeleteConfirm(u)} style={btn('transparent', 'var(--text)', 'rgba(255,255,255,0.08)')}>Delete</button>
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
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setPaymentFilter(tab.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '100px', border: '1px solid ' + (paymentFilter === tab.id ? 'var(--primary)' : 'rgba(255,255,255,0.12)'),
                      background: paymentFilter === tab.id ? 'rgba(45,212,191,0.15)' : 'transparent',
                      color: paymentFilter === tab.id ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
                      fontSize: '12px', fontWeight: paymentFilter === tab.id ? 600 : 400,
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                    }}>
                    {tab.icon} {tab.label} ({paymentStats[tab.id] || 0})
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '1rem' }}>
                {[
                  { label: 'Premium Users', value: paymentStats.premium, icon: '', color: 'var(--primary)' },
                  { label: 'Company Users', value: paymentStats.company, icon: '', color: 'var(--primary)' },
                  { label: 'Free Users', value: paymentStats.free, icon: '', color: 'var(--primary)' },
                  { label: 'Pending', value: paymentStats.pending, icon: '⏳', color: 'var(--info)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>{s.icon}</span>
                    <span style={{ display: 'block', fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                  <p style={{ color: 'var(--primary)', fontSize: '14px' }}>No users match this filter.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(u => {
                    const plan = planBadge(u.subscription_plan, u.plan_type)
                    return (
                      <div key={u.id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                            {u.full_name || 'Unnamed'}
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginLeft: '4px' }}>{u.email || ''}</span>
                          </span>
                          <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                          {u.subscription_status === 'pending' && (
                            <span style={{ background: 'rgba(45,212,191,0.15)', color: 'var(--info)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid var(--info)' }}>Pending</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(!u.subscription_plan || u.subscription_plan === 'free') && u.plan_type !== 'company' && (
                            <button onClick={() => setShowGrantPremium(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', 'var(--primary)', 'var(--primary)')}>
                              {actionLoading === u.id ? '...' : 'Grant Premium'}
                            </button>
                          )}
                          {(u.subscription_plan === 'premium' && u.plan_type !== 'company') && (
                            <button onClick={() => setShowRevokePremium(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', 'var(--info)', 'var(--info)')}>
                              {actionLoading === u.id ? '...' : 'Revoke'}
                            </button>
                          )}
                          {u.plan_type === 'company' && (
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Managed by employer</span>
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
        <div onClick={() => setShowSuspendConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid ' + (showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--info)'), maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{showSuspendConfirm.status === 'suspended' ? '\u{25B6}' : '\u{23F8}'}</span>
            <h3 style={{ color: showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--info)', fontSize: '16px', margin: '0 0 8px' }}>
              {showSuspendConfirm.status === 'suspended' ? 'Reactivate User?' : 'Suspend User?'}
            </h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--primary)' }}>"{showSuspendConfirm.full_name || showSuspendConfirm.username || 'User'}"</strong> will be {showSuspendConfirm.status === 'suspended' ? 'reactivated' : 'suspended'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSuspendConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => toggleStatus(showSuspendConfirm.id, showSuspendConfirm.status || 'active')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showSuspendConfirm.status === 'suspended' ? 'rgba(255,255,255,0.12)' : 'rgba(45,212,191,0.15)', border: 'none', color: showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {showSuspendConfirm.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{'\u{1F5D1}'}</span>
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Delete User?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              Permanently delete <strong style={{ color: 'var(--primary)' }}>"{showDeleteConfirm.full_name || 'User'}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => deleteUser(showDeleteConfirm.id)} disabled={actionLoading === showDeleteConfirm.id} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {actionLoading === showDeleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {showPasswordReset && (
        <div onClick={() => { setShowPasswordReset(null); setNewPassword(''); setShowNewPassword(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--primary)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{'\u{1F511}'}</span>
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 4px' }}>Set New Password</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '16px' }}>
              For <strong style={{ color: 'var(--primary)' }}>{showPasswordReset.full_name || showPasswordReset.username || 'User'}</strong>
              {showPasswordReset.email && <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>{showPasswordReset.email}</span>}
            </p>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input type={showNewPassword ? 'text' : 'password'} placeholder="Enter new password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 80px 10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && handleAdminResetPassword()} autoFocus />
              <button onClick={() => setShowNewPassword(!showNewPassword)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}
                title={showNewPassword ? 'Hide password' : 'Show password'}>
                {showNewPassword ? '' : ''}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowPasswordReset(null); setNewPassword(''); setShowNewPassword(false) }} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={handleAdminResetPassword} disabled={resetLoading || newPassword.length < 8} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: newPassword.length >= 8 ? 'var(--primary)' : 'rgba(255,255,255,0.12)', border: 'none', color: newPassword.length >= 8 ? 'var(--bg)' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: 600, cursor: newPassword.length >= 8 ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>
                {resetLoading ? '...' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Premium Modal */}
      {showGrantPremium && (
        <div onClick={() => setShowGrantPremium(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--primary)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 8px' }}>Grant Premium Access?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              Give <strong style={{ color: 'var(--primary)' }}>"{showGrantPremium.full_name || 'User'}"</strong> free Premium access? This can be revoked later.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowGrantPremium(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => grantPremium(showGrantPremium.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Grant Premium</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Premium Modal */}
      {showRevokePremium && (
        <div onClick={() => setShowRevokePremium(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--info)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>⬇</span>
            <h3 style={{ color: 'var(--info)', fontSize: '16px', margin: '0 0 8px' }}>Revoke Premium Access?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--primary)' }}>"{showRevokePremium.full_name || 'User'}"</strong> will be moved back to the Free plan.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowRevokePremium(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => revokePremium(showRevokePremium.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(45,212,191,0.15)', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Revoke</button>
            </div>
          </div>
        </div>
      )}

      <style>{'@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }'}</style>
    </div>
  )
}
