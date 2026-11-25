import { toast } from '../../components/ToastProvider'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import UserAvatar from '../../components/UserAvatar'
import NumberField from '../../components/NumberField'
import { PLANS, PLAN_STATUSES } from '../../config/plans'
import { useI18n } from '../../i18n'
import { BrandLoader } from '../../components/Brand'
import { useAuthProfile } from '../../context/AuthProfileContext'

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
  const { user: actor, isSuperAdmin } = useAuthProfile()
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
  const [editingUser, setEditingUser] = useState(null)
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
    } catch {
      setError('Failed to load users.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchUsers() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchUsers])

  const toggleStatus = async (userId, currentStatus) => {
    setActionLoading(userId)
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended'
    try {
      const { data: updated, error: statusError } = await supabase.rpc('admin_set_user_status', { p_user_id: userId, p_status: newStatus })
      if (statusError || updated?.id !== userId || updated?.status !== newStatus) throw statusError || new Error('Status change could not be verified')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u))
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
    } catch (error) { toast.error(error.message || 'Failed to update.') }
    setActionLoading(null)
    setShowSuspendConfirm(null)
  }

  const deleteUser = async (userId) => {
    setActionLoading(userId)
    try {
      const { data: deletion, error: delError } = await supabase.functions.invoke('delete-account', {
        body: { action: 'admin-delete', userId },
      })
      if (delError || deletion?.success !== true) throw delError || new Error('Deletion was not confirmed')
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast.success('User deleted permanently.')
    } catch { toast.error('Delete failed.') }
    setActionLoading(null)
    setShowDeleteConfirm(null)
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
      const { data } = await supabase
        .from('audit_logs')
        .select('id, created_at, metadata')
        .eq('action', 'subscription_change')
        .eq('target_table', 'profiles')
        .eq('target_id', list[0].id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (data) {
        setSubHistory(data.map((row) => ({
          id: row.id,
          created_at: row.created_at,
          old_plan: row.metadata?.old_plan || null,
          new_plan: row.metadata?.new_plan || null,
          new_status: row.metadata?.new_status || null,
          reason: row.metadata?.reason || null,
        })))
      }
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
      const { data, error } = await supabase.rpc('admin_set_subscription', {
        p_user_ids: ids, p_plan: subForm.plan, p_status: subForm.status,
        p_expires_at: expiresAt, p_plan_type: subForm.planType || null, p_reason: subForm.reason.trim(),
      })
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      if (rows.length !== ids.length) throw new Error('Not all subscription updates were confirmed. Refresh to check the current state.')
      const byId = new Map(rows.map(r => [r.id, r]))
      setUsers(prev => prev.map(u => byId.has(u.id) ? { ...u, ...byId.get(u.id) } : u))
      toast.success(`Subscription updated for ${rows.length} user(s).`)
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
  const activeSuperAdminCount = users.filter(u => u.role === 'super_admin' && u.status === 'active').length

  const riskBadge = (risk) => {
    if (risk === 'high') return { bg: '#5F1728', color: '#FFE4EA', border: '#F2768A', label: 'High' }
    if (risk === 'medium') return { bg: '#432D13', color: '#F2B95C', border: '#F2B95C', label: 'Medium' }
    return { bg: '#291447', color: '#EAD9F3', border: '#C8A6E0', label: 'Low' }
  }

  const planBadge = (plan, planType) => {
    if (planType === 'company') return { bg: '#291447', color: '#EAD9F3', border: '#C8A6E0', label: 'Company' }
    if (plan === 'premium') return { bg: '#291447', color: '#EAD9F3', border: '#C8A6E0', label: 'Premium' }
    return { bg: 'transparent', color: 'var(--text-muted)', border: 'rgba(255,255,255,0.12)', label: 'Free' }
  }

  const btn = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: '1px solid ' + (border || bg),
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: 'var(--font-body)', fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <BrandLoader variant="section" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>

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
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}>
              {activeTab === 'users' ? 'User management' : activeTab === 'transactions' ? 'Subscription transactions' : 'Subscription access'}
            </h2>
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

        <div style={{ padding: '1.5rem', maxWidth: '100%' }}>
          {/* Main Tabs: Users | Payments */}
          <div className="user-management-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', overflowX: 'auto' }}>
            <button aria-pressed={activeTab === 'users'} onClick={() => { setActiveTab('users'); setSearch(''); setFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'users' ? 'rgb(var(--primary-rgb) / 0.15)' : 'transparent', color: activeTab === 'users' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'users' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              Users
            </button>
            <button aria-pressed={activeTab === 'payments'} onClick={() => { setActiveTab('payments'); setSearch(''); setPaymentFilter('all') }}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === 'payments' ? 'rgb(var(--primary-rgb) / 0.15)' : 'transparent', color: activeTab === 'payments' ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === 'payments' ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              Subscription access
            </button>
            <button type="button" aria-pressed={activeTab === 'transactions'} className={activeTab === 'transactions' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('transactions')}>Subscription transactions</button>
            {activeTab === 'payments' && filtered.length > 0 && filtered.length <= 100 && (
              <button onClick={() => openSubModal(filtered)}
                style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                Bulk ({filtered.length})
              </button>
            )}
          </div>

          {activeTab === 'transactions' && <SubscriptionTransactions />}
          {activeTab === 'payments' && <p>Manual access grants and adjustments are recorded in subscription history. They do not create a payment or prove that money was received.</p>}
          {/* Users Tab */}
          {activeTab === 'users' && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name, email, username, or phone..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-body)' }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all', 'high', 'medium', 'low'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      style={{ padding: '6px 14px', borderRadius: '100px', border: '1px solid ' + (filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.12)'), background: filter === f ? 'rgb(var(--primary-rgb) / 0.15)' : 'transparent', color: filter === f ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: filter === f ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + ' Risk'}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
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
                      <div key={u.id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid ' + (isSuspended ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'), borderRadius: '12px', padding: '16px', opacity: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <UserAvatar reference={u.avatar_url} name={u.full_name || u.username} size={32} />
                              <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>
                                {u.full_name || 'Unnamed'}
                                {u.username && <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 400 }}> @{u.username}</span>}
                              </span>
                              <span style={{ background: risk.bg, color: risk.color, border: '1px solid ' + risk.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{risk.label} Risk</span>
                              <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                              <span className="operational-role-badge" style={{ background: 'rgb(var(--primary-rgb) / 0.15)', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>
                                {t(({ super_admin: 'users.roleSuperAdmin', admin: 'users.roleAdmin', therapist: 'users.roleTherapist', insurer: 'users.roleInsurer', user: 'users.roleUser' })[u.role] || 'users.roleUser')}
                              </span>
                              {isSuspended && (
                                <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--text)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>Suspended</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}>
                                 {u.email || 'No email'}
                                {u.email && <button onClick={async () => { try { await navigator.clipboard.writeText(u.email); toast.success('Email copied!') } catch { toast.error('Email could not be copied.') } }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }} title="Copy email">Copy</button>}
                              </span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {u.phone || 'No phone'}</span>
                              <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {u.streak_days || 0}d streak</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Joined {fmt(u.created_at)}</span>
                            </div>

                            {hasPartner && (
                              <div style={{ background: 'var(--bg)', border: '1px solid rgb(var(--primary-rgb) / 0.2)', borderRadius: '8px', padding: '8px 12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 600 }}> Partner:</span>
                                {u.accountability_partner_name && <span style={{ color: 'var(--text)', fontSize: '12px' }}>{u.accountability_partner_name}</span>}
                                {u.accountability_partner_phone && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                     {u.accountability_partner_phone}
                                    <button onClick={async () => { try { await navigator.clipboard.writeText(u.accountability_partner_phone); toast.success('Partner phone copied!') } catch { toast.error('Phone could not be copied.') } }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', marginLeft: '4px' }}>Copy phone</button>
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
                            <button onClick={() => setShowSuspendConfirm(u)} disabled={actionLoading === u.id || u.id === actor?.id || u.role === 'super_admin'}
                              title={u.id === actor?.id ? 'You cannot suspend your own account' : u.role === 'super_admin' ? 'Change this account role through the verified editor first' : undefined}
                              style={btn('transparent', isSuspended ? 'var(--primary)' : 'var(--info)', isSuspended ? 'var(--primary)' : 'var(--info)')}>
                              {actionLoading === u.id ? '...' : isSuspended ? 'Reactivate' : 'Suspend'}
                            </button>
                            {isSuperAdmin && (
                              <button type="button" onClick={() => setEditingUser(u)}
                                style={btn('transparent', 'var(--primary)', 'var(--primary)')}>
                                {t('users.editUser')}
                              </button>
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
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-body)' }} />
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setPaymentFilter(tab.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '100px', border: '1px solid ' + (paymentFilter === tab.id ? 'var(--primary)' : 'rgba(255,255,255,0.12)'),
                      background: paymentFilter === tab.id ? 'rgb(var(--primary-rgb) / 0.15)' : 'transparent',
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
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
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
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px' }}>{u.email || ''}</span>
                          </span>
                          <span style={{ background: plan.bg, color: plan.color, border: '1px solid ' + plan.border, padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>{plan.label}</span>
                          {u.subscription_status === 'pending' && (
                            <span style={{ background: 'rgb(var(--primary-rgb) / 0.15)', color: 'var(--info)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid var(--info)' }}>Pending</span>
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
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Managed by employer</span>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--bg-rgb) / 0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
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
              <button onClick={() => setShowSuspendConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => toggleStatus(showSuspendConfirm.id, showSuspendConfirm.status || 'active')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showSuspendConfirm.status === 'suspended' ? 'rgba(255,255,255,0.12)' : 'rgb(var(--primary-rgb) / 0.15)', border: 'none', color: showSuspendConfirm.status === 'suspended' ? 'var(--primary)' : 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {showSuspendConfirm.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--bg-rgb) / 0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowDeleteConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <AppIcon name="close" size={36} style={{ display: 'block', margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Delete User?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px' }}>
              Permanently delete <strong style={{ color: 'var(--primary)' }}>"{showDeleteConfirm.full_name || 'User'}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={() => deleteUser(showDeleteConfirm.id)} disabled={actionLoading === showDeleteConfirm.id} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {actionLoading === showDeleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Subscription Modal (single or bulk) */}
      {subModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--bg-rgb) / 0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setSubModal(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--primary)', maxWidth: '440px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '16px', margin: '0 0 4px' }}>Change subscription</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 14px' }}>
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
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 6px' }}>Recent history</p>
                {subHistory.slice(0, 5).map(h => (
                  <p key={h.id} style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '2px 0' }}>
                    {new Date(h.created_at).toLocaleDateString()} — {h.old_plan || '—'} → {h.new_plan || '—'} ({h.new_status}){h.reason ? ` · ${h.reason}` : ''}
                  </p>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSubModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={saveSubscription} disabled={subSaving} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'var(--on-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {subSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && isSuperAdmin && (
        <UserAccountEditor
          user={editingUser}
          actorId={actor?.id}
          isLastActiveSuperAdmin={editingUser.role === 'super_admin'
            && editingUser.status === 'active'
            && activeSuperAdminCount <= 1}
          onClose={() => setEditingUser(null)}
          onUpdated={fetchUsers}
        />
      )}

      <style>{'@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }'}</style>
    </div>
  )
}

function SubscriptionTransactions() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const result = await supabase.rpc('admin_subscription_transactions')
    if (result.error || !Array.isArray(result.data)) setError('Transactions could not be loaded. Check super-admin access and the account-workflow migration.')
    else { setRows(result.data || []); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  if (loading) return <BrandLoader variant="section" />
  return <section className="portal-card"><h3>Platform subscription transaction ledger</h3>
    <p>Amount is the requested transaction value, not insurance premium or a manual access grant. Created is initiation time; updated is the latest ledger change, not necessarily the provider’s settlement time. Only successful M-Pesa rows marked provider-query verified are confirmed real payments. Sandbox transactions are simulations.</p>
    {error && <p role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
    {!error && !rows.length && <p>No platform subscription transactions recorded.</p>}
    <div className="operational-table-scroll"><table><thead><tr><th>Account</th><th>Amount</th><th>Channel</th><th>Status</th><th>Created</th><th>Updated</th><th>Provider request reference</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.user_id}</td><td>{row.currency} {Number(row.amount).toLocaleString()}</td><td>{row.provider === 'sandbox' ? 'Sandbox simulation' : row.provider}</td><td>{row.status}{row.provider_verified ? ' · provider-query verified' : ' · not provider-verified'}{row.provider_result_code ? ` (code ${row.provider_result_code})` : ''}</td><td>{new Date(row.created_at).toLocaleString()}</td><td>{new Date(row.updated_at).toLocaleString()}</td><td>{row.provider_ref || 'Not recorded'}</td></tr>)}</tbody></table></div>
  </section>
}

const ROLES = ['user', 'admin', 'therapist', 'insurer', 'super_admin']
const ROLE_LABELS = {
  user: 'users.roleUser',
  admin: 'users.roleAdmin',
  therapist: 'users.roleTherapist',
  insurer: 'users.roleInsurer',
  super_admin: 'users.roleSuperAdmin',
}
const ACTIONS = [
  'admin_role_changed',
  'admin_profile_updated',
  'admin_email_updated',
  'admin_reset_link_sent',
  'admin_temporary_password_set',
  'admin_temporary_password_changed',
]

function UserAccountEditor({ user, actorId, isLastActiveSuperAdmin, onClose, onUpdated }) {
  const { t } = useI18n()
  const [section, setSection] = useState('role')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [stepUpPassword, setStepUpPassword] = useState('')
  const [role, setRole] = useState(user.role || 'user')
  const [insurers, setInsurers] = useState([])
  const [therapists, setTherapists] = useState([])
  const [insurerId, setInsurerId] = useState('')
  const [acknowledgeOpenWork, setAcknowledgeOpenWork] = useState(false)
  const [reassignmentTherapistId, setReassignmentTherapistId] = useState('')
  const [profile, setProfile] = useState({
    username: user.username || '',
    fullName: user.full_name || '',
    phone: user.phone || '',
  })
  const [credentialAction, setCredentialAction] = useState('send-reset-link')
  const [email, setEmail] = useState(user.email || '')
  const [history, setHistory] = useState([])
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isSelf = user.id === actorId
  const protectedTarget = isSelf || user.role === 'super_admin'
  const canEditRole = !isSelf && !(user.role === 'super_admin' && isLastActiveSuperAdmin)
  const [roleRequestId, setRoleRequestId] = useState(() => crypto.randomUUID())
  const expectedConfirmation = user.username || user.email || user.id
  const confirmationMatches = confirmation.trim() === expectedConfirmation

  const roleOptions = useMemo(() => ROLES.filter((item) => item !== user.role), [user.role])

  useEffect(() => {
    let active = true
    const loadSupportingData = async () => {
      const [insurerResult, therapistResult, historyResult] = await Promise.all([
        supabase.from('insurers').select('id, name').eq('status', 'active').order('name'),
        supabase.from('profiles').select('id, full_name, username').eq('role', 'therapist').eq('status', 'active'),
        supabase.from('audit_logs').select('id, action, metadata, created_at')
          .eq('target_table', 'profiles').eq('target_id', user.id)
          .in('action', ACTIONS).order('created_at', { ascending: false }).limit(10),
      ])
      if (!active) return
      if (insurerResult.error) toast.error(insurerResult.error.message)
      else setInsurers(insurerResult.data || [])
      if (therapistResult.error) toast.error(therapistResult.error.message)
      else setTherapists(therapistResult.data || [])
      if (historyResult.error) toast.error(historyResult.error.message)
      else setHistory(historyResult.data || [])
    }
    void loadSupportingData()
    return () => { active = false }
  }, [user.id])

  const runAction = async (action, data) => {
    if (action !== 'set-role' && !confirmationMatches) { toast.error(t('users.confirmationMismatch')); return }
    if (action !== 'set-role' && reason.trim().length < 5) { toast.error(t('users.reasonRequired')); return }
    if (action === 'set-role' && !stepUpPassword) { toast.error('Enter your super-admin password.'); return }
    const submittedPassword = stepUpPassword
    setStepUpPassword('')
    setBusy(true)
    let response, error
    try {
      const outcome = await supabase.functions.invoke('admin-user-update', {
      body: {
        action,
        targetId: user.id,
        ...(action === 'set-role' ? { requestId: roleRequestId, expectedRole: user.role } : { reason: reason.trim(), typedConfirmation: confirmation.trim() }),
        ownPassword: submittedPassword,
        ...data,
      },
      })
      response = outcome.data
      error = outcome.error
      if (error?.context instanceof Response) {
        const detail = await error.context.clone().json().catch(() => null)
        if (detail?.error) response = detail
        else if (error.context.status === 404) response = { error: 'admin-user-update is not deployed for this Supabase project. Staff must deploy the updated function.' }
        else if (error.context.status === 401) response = { error: 'Your session expired or could not be verified. Sign in again; staff should check JWT configuration if this continues.' }
        else if (detail?.message) response = { error: detail.message }
      }
    } catch {
      error = new Error('Cannot reach admin-user-update. Check your connection; staff should check the deployed function, ALLOWED_ORIGIN and server keys.')
    } finally { setStepUpPassword('') }
    if (error || response?.error || response?.success !== true) {
      if (response?.temporaryPassword) setTemporaryPassword(response.temporaryPassword)
      toast.error(response?.error || (error?.name === 'FunctionsFetchError' ? 'Account service unreachable. Check the function deployment and allowed origin.' : error?.message) || t('users.updateFailed'))
      setBusy(false)
      return null
    }
    return response || {}
  }

  const saveRole = async () => {
    if (!canEditRole) return
    if (role === 'insurer' && !insurerId) { toast.error(t('users.selectInsurer')); return }
    const result = await runAction('set-role', {
      newRole: role,
      insurerId: role === 'insurer' ? insurerId : null,
      acknowledgeOpenWork,
      reassignmentTherapistId: reassignmentTherapistId || null,
    })
    if (!result) { setBusy(false); return }
    const { data: persisted, error: verifyError } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
    if (verifyError || persisted?.role !== role) {
      toast.error('The role could not be verified. Refresh this account before retrying.')
      setBusy(false)
      await onUpdated()
      return
    }
    await onUpdated()
    toast.success(t('users.roleSaved'))
    setRoleRequestId(crypto.randomUUID())
    setBusy(false)
    onClose()
  }

  const saveProfile = async () => {
    const result = await runAction('set-profile', {
      username: profile.username,
      fullName: profile.fullName,
      phone: protectedTarget ? null : profile.phone,
    })
    if (!result) { setBusy(false); return }
    toast.success(t('users.profileSaved'))
    await onUpdated()
    setBusy(false)
  }

  const saveCredentials = async () => {
    if (credentialAction === 'set-email') {
      const result = await runAction('set-email', { email: email.trim() })
      if (!result) { setBusy(false); return }
      toast.success(t('users.emailUpdated'))
    } else if (credentialAction === 'set-temporary-password') {
      const result = await runAction('set-temporary-password', {})
      if (!result) { setBusy(false); return }
      setTemporaryPassword(result.temporaryPassword || '')
      toast.success(t('users.temporaryPasswordCreated'))
    } else {
      const result = await runAction('send-reset-link', {})
      if (!result) { setBusy(false); return }
      toast.success(t('users.resetLinkSent'))
    }
    setBusy(false)
    await onUpdated()
  }

  const copyTemporaryPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      toast.success(t('users.passwordCopied'))
    } catch {
      toast.error(t('users.passwordCopyFailed'))
    }
  }

  const roleDisabledReason = isSelf
    ? t('users.selfRoleDisabled')
    : isLastActiveSuperAdmin && user.role === 'super_admin'
      ? t('users.lastSuperAdminDisabled')
      : ''

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'rgb(var(--bg-rgb) / 0.94)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0.5rem' }}>
      <button type="button" className="modal-backdrop" aria-label={t('users.closeEditor')} onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="account-editor-title"
        style={{ position: 'relative', zIndex: 1, background: 'var(--bg)', border: '1px solid rgb(var(--primary-rgb) / 0.4)', borderRadius: '14px', width: '100%', maxWidth: '620px', maxHeight: '94vh', overflowY: 'auto', padding: 'clamp(14px, 4vw, 24px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 id="account-editor-title" style={{ color: 'var(--primary)', margin: 0 }}>{t('users.editUserTitle')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', overflowWrap: 'anywhere' }}>
              {user.full_name || user.username || user.email || user.id}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('users.closeEditor')} style={{ minWidth: 44, minHeight: 44, color: 'var(--text)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8 }}>×</button>
        </div>

        <nav aria-label={t('users.editUser')} style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16 }}>
          {['role', 'profile', 'credentials'].map((item) => (
            <button type="button" key={item} onClick={() => setSection(item)}
              aria-current={section === item ? 'page' : undefined}
              style={{ flex: '1 0 auto', minHeight: 44, padding: '8px 12px', borderRadius: 8, color: section === item ? 'var(--bg)' : 'var(--primary)', background: section === item ? 'var(--primary)' : 'transparent', border: '1px solid var(--primary)' }}>
              {t(`users.${item}Section`)}
            </button>
          ))}
        </nav>

        {section === 'role' && (
          <div>
            <fieldset disabled={!canEditRole || busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ color: 'var(--primary)', marginBottom: 8 }}>{t('users.roleSection')}</legend>
              <div className="form-group">
                <p>Current role: <strong>{user.role?.replace('_', ' ')}</strong></p>
                <label htmlFor="account-role">New role</label>
                <select id="account-role" value={role} onChange={(event) => { setRole(event.target.value); setRoleRequestId(crypto.randomUUID()) }}>
                  <option value={user.role}>{t(ROLE_LABELS[user.role] || 'users.roleUser')}</option>
                  {roleOptions.map((item) => <option key={item} value={item}>{t(ROLE_LABELS[item])}</option>)}
                </select>
                {roleDisabledReason && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{roleDisabledReason}</p>}
              </div>
              {role === 'insurer' && (
                <div className="form-group">
                  <label htmlFor="account-insurer">{t('users.insurerOrganisation')}</label>
                  <select id="account-insurer" value={insurerId} onChange={(event) => setInsurerId(event.target.value)}>
                    <option value="">{t('users.selectInsurer')}</option>
                    {insurers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              )}
              {user.role === 'therapist' && role !== 'therapist' && (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0' }}>
                    <input type="checkbox" checked={acknowledgeOpenWork} onChange={(event) => setAcknowledgeOpenWork(event.target.checked)} />
                    <span>{t('users.reassignOpenWork')}</span>
                  </label>
                  <div className="form-group">
                    <label htmlFor="reassignment-therapist">{t('users.reassignTherapist')}</label>
                    <select id="reassignment-therapist" value={reassignmentTherapistId} onChange={(event) => setReassignmentTherapistId(event.target.value)}>
                      <option value="">{t('users.selectTherapist')}</option>
                      {therapists.filter((item) => item.id !== user.id).map((item) => (
                        <option key={item.id} value={item.id}>{item.full_name || item.username || item.id}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
                <div className="form-group">
                  <label htmlFor="role-step-up">Your super-admin password</label>
                  <input id="role-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
                </div>
              <button type="button" className="btn-primary full" onClick={saveRole} disabled={!canEditRole || busy || !stepUpPassword || role === user.role}>
                {t('users.saveRole')}
              </button>
            </fieldset>
          </div>
        )}

        {section === 'profile' && (
          <div>
            <div className="form-group">
              <label htmlFor="account-username">{t('users.username')}</label>
              <input id="account-username" value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} maxLength={30} />
            </div>
            <div className="form-group">
              <label htmlFor="account-full-name">{t('users.fullName')}</label>
              <input id="account-full-name" value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} maxLength={200} />
            </div>
            <div className="form-group">
              <label htmlFor="account-phone">{t('users.phone')}</label>
              <input id="account-phone" type="tel" value={profile.phone} disabled={protectedTarget}
                onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} maxLength={24} />
              {protectedTarget && <small>{t('users.protectedPhone')}</small>}
            </div>
            <div className="form-group">
              <label htmlFor="profile-reason">{t('users.profileReason')}</label>
              <input id="profile-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
            </div>
            <div className="form-group">
              <label htmlFor="profile-confirmation">{t('users.confirmAccount')}</label>
              <input id="profile-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required />
            </div>
            <div className="form-group">
              <label htmlFor="profile-step-up">{t('users.stepUpPassword')}</label>
              <input id="profile-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
            </div>
            <button type="button" className="btn-primary full" onClick={saveProfile} disabled={busy || !confirmationMatches}>
              {t('users.saveProfile')}
            </button>
          </div>
        )}

        {section === 'credentials' && (
          <div>
            <div className="form-group">
              <label htmlFor="credential-action">{t('users.credentialsSection')}</label>
              <select id="credential-action" value={credentialAction} onChange={(event) => { setCredentialAction(event.target.value); setTemporaryPassword('') }}>
                <option value="send-reset-link">{t('users.sendReset')}</option>
                <option value="set-email" disabled={protectedTarget}>{t('users.changeEmail')}</option>
                <option value="set-temporary-password" disabled={protectedTarget}>{t('users.temporaryPassword')}</option>
              </select>
            </div>
            {credentialAction === 'set-email' && (
              <div className="form-group">
                <label htmlFor="account-email">{t('users.newEmail')}</label>
                <input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            )}
            {protectedTarget && <p role="note" style={{ color: 'var(--text-muted)' }}>{t('users.protectedCredentials')}</p>}
            <div className="form-group">
              <label htmlFor="credential-reason">{t('users.profileReason')}</label>
              <input id="credential-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
            </div>
            <div className="form-group">
              <label htmlFor="credential-confirmation">{t('users.confirmAccount')}</label>
              <input id="credential-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required />
            </div>
            <div className="form-group">
              <label htmlFor="credential-step-up">{t('users.stepUpPassword')}</label>
              <input id="credential-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
            </div>
            <button type="button" className="btn-primary full" onClick={saveCredentials}
              disabled={busy || !confirmationMatches || (protectedTarget && credentialAction !== 'send-reset-link')}>
              {credentialAction === 'send-reset-link' ? t('users.sendReset') : t('users.saveCredentials')}
            </button>
            {temporaryPassword && (
              <div role="alert" style={{ border: '1px solid var(--primary)', borderRadius: 10, padding: 12, marginTop: 14 }}>
                <p>{t('users.temporaryPasswordWarning')}</p>
                <code style={{ display: 'block', overflowWrap: 'anywhere', userSelect: 'all' }}>{temporaryPassword}</code>
                <button type="button" onClick={copyTemporaryPassword} style={{ minHeight: 44, marginTop: 10 }}>{t('users.copyPassword')}</button>
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <section aria-label={t('users.accountHistory')} style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 20, paddingTop: 12 }}>
            <h3 style={{ color: 'var(--primary)', fontSize: 14 }}>{t('users.accountHistory')}</h3>
            {history.map((item) => (
              <p key={item.id} style={{ color: 'var(--text-muted)', fontSize: 12, overflowWrap: 'anywhere' }}>
                {new Date(item.created_at).toLocaleString()} — {item.action.replaceAll('_', ' ')}
                {item.metadata?.old_role && `: ${item.metadata.old_role} → ${item.metadata.new_role}`}
                {item.metadata?.reason && ` · ${item.metadata.reason}`}
              </p>
            ))}
          </section>
        )}
      </section>
    </div>
  )
}
