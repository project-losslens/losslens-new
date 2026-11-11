import { toast } from '../../components/ToastProvider'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import UserAvatar from '../../components/UserAvatar'
import NumberField from '../../components/NumberField'
import { PLANS, PLAN_STATUSES } from '../../config/plans'
import { useI18n } from '../../i18n'
import { BrandLoader } from '../../components/Brand'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

const TABS = [
  { id: 'all', label: 'All Users', icon: '' },
  { id: 'premium', label: 'Premium', icon: '' },
  { id: 'company', label: 'Company', icon: '' },
  { id: 'free', label: 'Free', icon: '' },
  { id: 'pending', label: 'Pending', icon: '' },
]


export default function UserManagement() {
  const { t } = useI18n()
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
  const [showTherapistPromotion, setShowTherapistPromotion] = useState(null)
  const [showTherapistRevert, setShowTherapistRevert] = useState(null)
  const [showPasswordReset, setShowPasswordReset] = useState(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [subModal, setSubModal] = useState(null) // { users: [...] }
  const [subForm, setSubForm] = useState({ plan: 'premium', status: 'active', planType: '', expiryDays: '', expiryDate: '', reason: '' })
  const [subHistory, setSubHistory] = useState([])
  const [subSaving, setSubSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setUsers(data || [])
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
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
    } catch (err) { toast.error('Failed to update.') }
    setActionLoading(null)
    setShowSuspendConfirm(null)
  }

  const deleteUser = async (userId) => {
    setActionLoading(userId)
    try {
      const { error: delError } = await supabase.functions.invoke('delete-account', {
        body: { action: 'admin-delete', userId },
      })
      if (delError) throw delError
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast.success('User deleted permanently.')
    } catch (err) { toast.error('Delete failed.') }
    setActionLoading(null)
    setShowDeleteConfirm(null)
  }

  const handleAdminResetPassword = async () => {
    if (!showPasswordReset) return
    setResetLoading(true)
    try {
      const { data, error: resetError } = await supabase.functions.invoke('send-invite', {
        body: { action: 'reset-password', userId: showPasswordReset.id }
      })
      if (resetError || data?.error) throw new Error(data?.error || resetError?.message)
      toast.success(`Reset link sent for ${showPasswordReset.full_name || 'user'}.`)
      setShowPasswordReset(null)
    } catch (err) {
      console.error('Password reset link failed:', err)
      toast.error('Failed: ' + (err.message || 'Unknown error'))
    }
    setResetLoading(false)
  }

  const promoteToTherapist = async (userId) => {
    setActionLoading(userId)
    try {
      const { error: promotionError } = await supabase.rpc('admin_promote_therapist', { p_user_id: userId })
      if (promotionError) throw promotionError
      setUsers(prev => prev.map(user => user.id === userId ? { ...user, role: 'therapist' } : user))
      toast.success(t('users.promoteSuccess'))
      setShowTherapistPromotion(null)
    } catch (promotionError) {
      console.error('Therapist promotion failed:', promotionError)
      toast.error(t('users.promoteError'))
    } finally {
      setActionLoading(null)
    }
  }

  const revertTherapistToUser = async (userId) => {
    setActionLoading(userId)
    try {
      const { error: revertError } = await supabase.rpc('admin_revert_therapist', { p_user_id: userId })
      if (revertError) throw revertError
      setUsers(prev => prev.map(user => user.id === userId ? { ...user, role: 'user' } : user))
      toast.success(t('users.revertSuccess'))
      setShowTherapistRevert(null)
    } catch (revertError) {
      console.error('Therapist role revert failed:', revertError)
      toast.error(t('users.revertError'))
    } finally {
      setActionLoading(null)
    }
  }

  const openSubModal = async (userOrUsers) => {
    const list = Array.isArray(userOrUsers) ? userOrUsers : [userOrUsers]
    const first = list[0] || {}
    setSubForm({
      plan: first.subscription_plan && first.subscription_plan !== 'free' ? first.subscription_plan : 'premium',
      status: first.subscription_status || 'active',
      planType: first.plan_type || '',
      expiryDays: '', expiryDate: '', reason: '',
    })
    setSubHistory([])
    setSubModal({ users: list })
    if (list.length === 1) {
      const { data } = await supabase.rpc('admin_get_subscription_history', { p_user_id: list[0].id, p_limit: 10 })
      if (data) setSubHistory(data)
    }
  }

  const saveSubscription = async () => {
    if (!subModal) return
    if (!subForm.reason.trim()) { toast.error('A reason is required.'); return }
    let expiresAt = null
    if (subForm.expiryDate) expiresAt = new Date(subForm.expiryDate + 'T23:59:59').toISOString()
    else if (subForm.expiryDays) expiresAt = new Date(Date.now() + Number(subForm.expiryDays) * 86400000).toISOString()
    setSubSaving(true)
    try {
      const ids = subModal.users.map(u => u.id)
      let rows = []
      if (ids.length === 1) {
        const { data, error } = await supabase.rpc('admin_set_subscription', {
          p_user_id: ids[0], p_plan: subForm.plan, p_status: subForm.status,
          p_expires_at: expiresAt, p_plan_type: subForm.planType || null, p_reason: subForm.reason.trim(),
        })
        if (error) throw error
        rows = data ? [data] : []
      } else {
        const { data, error } = await supabase.rpc('admin_set_subscription_bulk', {
          p_user_ids: ids, p_plan: subForm.plan, p_status: subForm.status,
          p_expires_at: expiresAt, p_plan_type: subForm.planType || null, p_reason: subForm.reason.trim(),
        })
        if (error) throw error
        rows = Array.isArray(data) ? data : []
      }
      const byId = new Map(rows.map(r => [r.id, r]))
      setUsers(prev => prev.map(u => byId.has(u.id) ? { ...u, ...byId.get(u.id) } : u))
      toast.success(`Subscription updated for ${rows.length || ids.length} user(s).`)
      setSubModal(null)
    } catch (err) {
      console.error('Subscription update failed:', err)
      toast.error(err?.message || 'Subscription update failed.')
    } finally {
      setSubSaving(false)
    }
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
    a.href = url; a.download = 'losslens-users-' + new Date().toISOString().split('T')[0] + '.csv'
    a.click(); URL.revokeObjectURL(url)
    toast.success('CSV exported!')
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
    fontFamily: 'var(--font-body)', fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <BrandLoader variant="section" />
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}>
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
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'users' ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeTab === 'users' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'users' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              Users
            </button>
            <button onClick={() => { setActiveTab('payments'); setSearch(''); setPaymentFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'payments' ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeTab === 'payments' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'payments' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              Payments
            </button>
            {activeTab === 'payments' && filtered.length > 0 && filtered.length <= 100 && (
              <button onClick={() => openSubModal(filtered)}
                style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                Bulk ({filtered.length})
              </button>
            )}
          </div>

          {/* Users Tab */}
          {activeTab === 'users' && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name, email, username, or phone..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-body)' }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all', 'high', 'medium', 'low'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      style={{ padding: '6px 14px', borderRadius: '100px', border: '1px solid ' + (filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.12)'), background: filter === f ? 'rgba(45,212,191,0.15)' : 'transparent', color: filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: filter === f ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + ' Risk'}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <AppIcon name="users" size={48} style={{ display: 'block', margin: '0 auto 12px' }} />
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
                              <UserAvatar reference={u.avatar_url} name={u.full_name || u.username} size={32} />
                              <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>
                                {u.full_name || 'Unnamed'}
                                {u.username && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 400 }}> @{u.username}</span>}
                              </span>
                              <span style={{ background: risk.bg, color: risk.color, border: '1px solid ' + risk.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{risk.label} Risk</span>
                              <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                              {u.role !== 'user' && (
                                <span style={{ background: 'rgba(45,212,191,0.15)', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>
                                  {{ super_admin: 'Super Admin', admin: 'Admin', therapist: 'Therapist', insurer: 'Insurer' }[u.role] || u.role}
                                </span>
                              )}
                              {isSuspended && (
                                <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--text)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>Suspended</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}>
                                 {u.email || 'No email'}
                                {u.email && <button onClick={() => { navigator.clipboard.writeText(u.email); toast.success('Email copied!') }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }} title="Copy email"></button>}
                              </span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {u.phone || 'No phone'}</span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {u.streak_days || 0}d streak</span>
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Joined {fmt(u.created_at)}</span>
                            </div>

                            {hasPartner && (
                              <div style={{ background: 'var(--bg)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 600 }}> Partner:</span>
                                {u.accountability_partner_name && <span style={{ color: 'var(--text)', fontSize: '12px' }}>{u.accountability_partner_name}</span>}
                                {u.accountability_partner_phone && (
                                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                                     {u.accountability_partner_phone}
                                    <button onClick={() => { navigator.clipboard.writeText(u.accountability_partner_phone); toast.success('Partner phone copied!') }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }}></button>
                                  </span>
                                )}
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
                            <button onClick={() => setShowPasswordReset(u)}
                              style={btn('transparent', 'var(--primary)', 'var(--primary)')}>Send Reset Link</button>
                            {u.role === 'user' && <button onClick={() => setShowTherapistPromotion(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', 'var(--info)', 'var(--info)')}>{t('users.promoteTherapist')}</button>}
                            {u.role === 'therapist' && <button onClick={() => setShowTherapistRevert(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', 'var(--info)', 'var(--info)')}>{t('users.revertTherapist')}</button>}
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
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-body)' }} />
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setPaymentFilter(tab.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '100px', border: '1px solid ' + (paymentFilter === tab.id ? 'var(--primary)' : 'rgba(255,255,255,0.12)'),
                      background: paymentFilter === tab.id ? 'rgba(45,212,191,0.15)' : 'transparent',
                      color: paymentFilter === tab.id ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
                      fontSize: '12px', fontWeight: paymentFilter === tab.id ? 600 : 400,
                      cursor: 'pointer', fontFamily: 'var(--font-body)'
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
                  { label: 'Pending', value: paymentStats.pending, icon: '', color: 'var(--info)' },
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
                  <AppIcon name="users" size={48} style={{ display: 'block', margin: '0 auto 12px' }} />
                  <p style={{ color: 'var(--primary)', fontSize: '14px' }}>No users match this filter.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(u => {
                    const plan = planBadge(u.subscription_plan, u.plan_type)
                    return (
                      <div key={u.id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <UserAvatar reference={u.avatar_url} name={u.full_name || u.username} size={32} />
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
                          {u.plan_type !== 'company' && (
                            <button onClick={() => openSubModal(u)} disabled={actionLoading === u.id}
                              style={btn('transparent', 'var(--primary)', 'var(--primary)')}>
                              {actionLoading === u.id ? '...' : 'Subscription'}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowSuspendConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid ' + (showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--info)'), maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <AppIcon name={showSuspendConfirm.status === 'suspended' ? 'check' : 'clock'} size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--info)', fontSize: '16px', margin: '0 0 8px' }}>
              {showSuspendConfirm.status === 'suspended' ? 'Reactivate User?' : 'Suspend User?'}
            </h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--primary)' }}>"{showSuspendConfirm.full_name || showSuspendConfirm.username || 'User'}"</strong> will be {showSuspendConfirm.status === 'suspended' ? 'reactivated' : 'suspended'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSuspendConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => toggleStatus(showSuspendConfirm.id, showSuspendConfirm.status || 'active')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showSuspendConfirm.status === 'suspended' ? 'rgba(255,255,255,0.12)' : 'rgba(45,212,191,0.15)', border: 'none', color: showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {showSuspendConfirm.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTherapistPromotion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowTherapistPromotion(null)} />
          <section role="dialog" aria-modal="true" aria-labelledby="therapist-promotion-title" style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--info)', maxWidth: '420px', width: '100%' }}>
            <h2 id="therapist-promotion-title">{t('users.promoteTitle')}</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('users.promoteMessage', { name: showTherapistPromotion.full_name || showTherapistPromotion.username || t('users.thisAccount') })}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button type="button" onClick={() => setShowTherapistPromotion(null)} style={{ flex: 1 }} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => promoteToTherapist(showTherapistPromotion.id)} disabled={actionLoading === showTherapistPromotion.id} style={{ flex: 1 }} className="btn-primary">
                {actionLoading === showTherapistPromotion.id ? t('users.roleUpdating') : t('users.promoteConfirm')}
              </button>
            </div>
          </section>
        </div>
      )}

      {showTherapistRevert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowTherapistRevert(null)} />
          <section role="dialog" aria-modal="true" aria-labelledby="therapist-revert-title" style={{ position: 'relative', background: 'var(--surface)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--info)', maxWidth: '420px', width: '100%' }}>
            <h2 id="therapist-revert-title">{t('users.revertTitle')}</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('users.revertMessage', { name: showTherapistRevert.full_name || showTherapistRevert.username || t('users.thisAccount') })}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button type="button" onClick={() => setShowTherapistRevert(null)} style={{ flex: 1 }} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => revertTherapistToUser(showTherapistRevert.id)} disabled={actionLoading === showTherapistRevert.id} style={{ flex: 1 }} className="btn-primary">
                {actionLoading === showTherapistRevert.id ? t('users.roleUpdating') : t('users.revertConfirm')}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowDeleteConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="close" size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Delete User?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              Permanently delete <strong style={{ color: 'var(--primary)' }}>"{showDeleteConfirm.full_name || 'User'}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => deleteUser(showDeleteConfirm.id)} disabled={actionLoading === showDeleteConfirm.id} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {actionLoading === showDeleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password reset link confirmation */}
      {showPasswordReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowPasswordReset(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--primary)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="shield" size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 4px' }}>Send Password Reset Link</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '16px' }}>
              For <strong style={{ color: 'var(--primary)' }}>{showPasswordReset.full_name || showPasswordReset.username || 'User'}</strong>
              {showPasswordReset.email && <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>{showPasswordReset.email}</span>}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>The user will receive a secure reset link by email.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowPasswordReset(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={handleAdminResetPassword} disabled={resetLoading} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
                {resetLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Subscription Modal (single or bulk) */}
      {subModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setSubModal(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--primary)', maxWidth: '440px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 4px' }}>Change subscription</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 14px' }}>
              {subModal.users.length === 1
                ? `For ${subModal.users[0].full_name || subModal.users[0].username || 'user'} — changes are written to subscription history.`
                : `Applying to ${subModal.users.length} users (max 100) — atomic: all or nothing.`}
            </p>
            <div className="form-group"><label>Plan</label>
              <select value={subForm.plan} onChange={e => setSubForm({ ...subForm, plan: e.target.value })}>
                {Object.values(PLANS).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Status</label>
              <select value={subForm.status} onChange={e => setSubForm({ ...subForm, status: e.target.value })}>
                {PLAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Plan type (optional)</label>
              <input type="text" value={subForm.planType} onChange={e => setSubForm({ ...subForm, planType: e.target.value })} placeholder="e.g. individual" />
            </div>
            <div className="form-group"><label>Expires in (days)</label>
              <NumberField value={subForm.expiryDays} onChange={v => setSubForm({ ...subForm, expiryDays: v })} placeholder="e.g. 30" min={0} />
            </div>
            <div className="form-group"><label>…or exact expiry date</label>
              <input type="date" value={subForm.expiryDate} onChange={e => setSubForm({ ...subForm, expiryDate: e.target.value })} />
            </div>
            <div className="form-group"><label>Reason (required)</label>
              <input type="text" value={subForm.reason} onChange={e => setSubForm({ ...subForm, reason: e.target.value })} placeholder="Why is this changing?" />
            </div>
            {subHistory.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', margin: '0 0 6px' }}>Recent history</p>
                {subHistory.slice(0, 5).map(h => (
                  <p key={h.id} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', margin: '2px 0' }}>
                    {new Date(h.created_at).toLocaleDateString()} — {h.old_plan || '—'} → {h.new_plan || '—'} ({h.new_status}){h.reason ? ` · ${h.reason}` : ''}
                  </p>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSubModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={saveSubscription} disabled={subSaving} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'var(--bg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {subSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{'@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }'}</style>
    </div>
  )
}
