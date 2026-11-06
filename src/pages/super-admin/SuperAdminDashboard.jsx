import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

const ROUTES = {
  USERS: '/super-admin/users', ADMINS: '/super-admin/admins',
  SETTINGS: '/super-admin/settings', LOGS: '/super-admin/logs',
  B2B: '/super-admin/b2b', INSURANCE: '/super-admin/insurance',
  GRANTS: '/super-admin/grants', CHATS: '/super-admin/chats',
  CRISIS: '/admin/crisis', ANALYTICS: '/admin/analytics',
  BROADCAST: '/admin/broadcast', ADMIN: '/admin',
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

// Supabase returns {error} objects — it doesn't throw
const safeQuery = async (promise, fallback = { data: [], count: 0, error: null }) => {
  try {
    const res = await promise
    if (res.error) {
      console.warn('Query warning:', res.error.message)
      return { ...fallback, error: res.error }
    }
    return res
  } catch (err) {
    console.error('Query crashed:', err)
    return { ...fallback, error: err }
  }
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [partialError, setPartialError] = useState(null)
  const [stats, setStats] = useState({
    totalUsers: 0, activeToday: 0, totalAdmins: 0,
    crisisOpen: 0, b2bClients: 0, grantsPending: 0,
    totalRevenue: 0, flaggedMessages: 0, insurancePartners: 0,
  })
  const [recentAdmins, setRecentAdmins] = useState([])
  const [systemHealth, setSystemHealth] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [lastChecked, setLastChecked] = useState(null)

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPartialError(null)

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString()

      // Fetch independently so one failure doesn't kill the rest
      const totalUsersRes = await safeQuery(
        supabase.from('profiles').select('*', { count: 'exact', head: true })
      )
      const activeTodayRes = await safeQuery(
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', todayStr)
      )
      const totalAdminsRes = await safeQuery(
        supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['admin', 'super_admin'])
      )
      const crisisOpenRes = await safeQuery(
        supabase.from('crisis_alerts').select('*', { count: 'exact', head: true }).eq('resolved', false)
      )
      const b2bClientsRes = await safeQuery(
        supabase.from('b2b_clients').select('*', { count: 'exact', head: true }).eq('status', 'active')
      )
      const grantsPendingRes = await safeQuery(
        supabase.from('grant_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      )
      const insuranceRes = await safeQuery(
        supabase.from('insurance_partners').select('*', { count: 'exact', head: true }).eq('status', 'active')
      )
      // FIXED: Removed 'email' — column doesn't exist in profiles table
      const recentAdminsRes = await safeQuery(
        supabase.from('profiles')
          .select('id, full_name, role, created_at')
          .in('role', ['admin', 'super_admin'])
          .order('created_at', { ascending: false })
          .limit(10),
        { data: [] }
      )

      // Collect partial errors for the banner
      const errors = []
      if (totalUsersRes.error) errors.push('Users table error')
      if (activeTodayRes.error) errors.push('Active users (missing last_active?)')
      if (totalAdminsRes.error) errors.push('Admins query error (missing role?)')
      if (crisisOpenRes.error) errors.push('Crisis alerts table missing')
      if (b2bClientsRes.error) errors.push('B2B clients table missing')
      if (grantsPendingRes.error) errors.push('Grants table missing')
      if (insuranceRes.error) errors.push('Insurance table missing')
      if (recentAdminsRes.error) errors.push('Recent admins query failed')
      if (errors.length) setPartialError(errors.join(', '))

      // System health checks
      const health = []

      const dbCheck = await safeQuery(
        supabase.from('profiles').select('id').limit(1)
      )
      health.push({
        name: 'Database',
        status: dbCheck.error ? 'down' : 'operational',
        icon: '',
        detail: dbCheck.error?.message || ''
      })

      const authCheck = await supabase.auth.getSession()
      health.push({
        name: 'Auth Service',
        status: authCheck.error ? 'down' : authCheck.data?.session ? 'operational' : 'degraded',
        icon: '',
        detail: authCheck.error?.message || ''
      })

      const storageCheck = await safeQuery(supabase.storage.listBuckets())
      const hasAvatars = storageCheck.data?.some(b => b.name === 'avatars')
      health.push({
        name: 'Storage',
        status: storageCheck.error ? 'down' : hasAvatars ? 'operational' : 'degraded',
        icon: '',
        detail: storageCheck.error?.message || (!hasAvatars ? 'avatars bucket missing' : '')
      })

      // Don't ping edge functions from browser — CORS/auth hell
      health.push({
        name: 'Edge Functions',
        status: 'unknown',
        icon: '',
        detail: 'Check Supabase dashboard'
      })

      health.push({
        name: 'Realtime',
        status: 'operational',
        icon: '',
        detail: ''
      })

      setStats({
        totalUsers: totalUsersRes.count || 0,
        activeToday: activeTodayRes.count || 0,
        totalAdmins: totalAdminsRes.count || 0,
        crisisOpen: crisisOpenRes.count || 0,
        b2bClients: b2bClientsRes.count || 0,
        grantsPending: grantsPendingRes.count || 0,
        insurancePartners: insuranceRes.count || 0,
        totalRevenue: 0,
        flaggedMessages: 0,
      })
      setRecentAdmins(recentAdminsRes.data || [])
      setSystemHealth(health)
      setLastChecked(new Date())
    } catch (err) {
      console.error('Super admin fatal error:', err)
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const statsCards = useMemo(() => [
    { label: 'Total Users', value: stats.totalUsers, icon: '', path: ROUTES.USERS, color: '#2DD4BF' },
    { label: 'Active Today', value: stats.activeToday, icon: '', color: '#2DD4BF' },
    { label: 'Admins', value: stats.totalAdmins, icon: '', path: ROUTES.ADMINS, color: '#2DD4BF' },
    { label: 'Crisis Open', value: stats.crisisOpen, icon: '🆘', path: ROUTES.CRISIS, color: '#FFFFFF', urgent: stats.crisisOpen > 0 },
    { label: 'B2B Clients', value: stats.b2bClients, icon: '', path: ROUTES.B2B, color: '#7DBDEE' },
    { label: 'Grants Pending', value: stats.grantsPending, icon: '', path: ROUTES.GRANTS, color: '#2DD4BF' },
    { label: 'Insurance', value: stats.insurancePartners, icon: '', path: ROUTES.INSURANCE, color: '#2DD4BF' },
  ], [stats])

  const sections = useMemo(() => [
    {
      title: 'User & Admin Management',
      items: [
        { emoji: '', label: 'User Management', desc: 'View, edit, suspend, delete users', path: ROUTES.USERS },
        { emoji: '', label: 'Admin Management', desc: 'Create, manage admin accounts', path: ROUTES.ADMINS },
        { emoji: '', label: 'Audit Logs', desc: 'Full platform activity trail', path: ROUTES.LOGS },
        { emoji: '', label: 'Chat Viewer', desc: 'Monitor conversations', path: ROUTES.CHATS },
      ],
    },
    {
      title: 'Business & Finance',
      items: [
        { emoji: '', label: 'B2B Clients', desc: 'Corporate partnerships', path: ROUTES.B2B },
        { emoji: '', label: 'Insurance Partners', desc: 'Insurance integrations', path: ROUTES.INSURANCE },
        { emoji: '', label: 'Grant Applications', desc: 'Track funding', path: ROUTES.GRANTS },
      ],
    },
    {
      title: 'Platform Settings',
      items: [
        { emoji: '', label: 'System Settings', desc: 'Features, security, policies', path: ROUTES.SETTINGS },
        { emoji: '', label: 'Analytics', desc: 'Full analytics dashboard', path: ROUTES.ANALYTICS },
        { emoji: '', label: 'Broadcast', desc: 'Platform-wide announcements', path: ROUTES.BROADCAST },
      ],
    },
  ], [])

  const healthStatusColor = (status) => {
    if (status === 'operational') return '#2DD4BF'
    if (status === 'degraded') return '#7DBDEE'
    if (status === 'unknown') return 'rgba(255,255,255,0.5)'
    return '#FFFFFF'
  }

  const healthStatusLabel = (status) => {
    if (status === 'operational') return 'Operational'
    if (status === 'degraded') return 'Degraded'
    if (status === 'unknown') return 'Unknown'
    return 'Down'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading super admin panel...</p>
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
            <button onClick={fetchAllData} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #FFFFFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid #2DD4BF', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#2DD4BF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Super Admin</h1>
            <p style={{ fontSize: '12px', color: '#7DBDEE', margin: '2px 0 0' }}>{stats.totalUsers.toLocaleString()} users  · Full platform control</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAllData} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => navigate(ROUTES.ADMIN)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #7DBDEE', color: '#7DBDEE', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Admin Panel</button>
            <button onClick={handleSignOut} style={{ padding: '6px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Sign out</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {partialError && (
            <div style={{ background: 'rgba(45,212,191,0.15)', border: '1px solid #2DD4BF', borderRadius: '10px', padding: '10px 14px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#7DBDEE', fontSize: '12px' }}> Some data failed to load: {partialError}</span>
              <button onClick={fetchAllData} style={{ background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: ' Overview' },
              { id: 'admins', label: ' Admins' },
              { id: 'health', label: ' System Health' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minWidth: '100px', transition: 'background 0.2s, color 0.2s' }}>{tab.label}</button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
                {statsCards.map((s, i) => (
                  <div key={i}
                    onClick={() => s.path && navigate(s.path)}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: `1px solid ${s.urgent ? '#FFFFFF' : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: '12px', padding: '16px', textAlign: 'center',
                      cursor: s.path ? 'pointer' : 'default',
                      boxShadow: s.urgent ? '0 0 20px rgba(255,255,255,0.4)' : 'none',
                      animation: s.urgent ? 'urgentPulse 2s ease-in-out infinite' : 'none',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={e => { if (s.path) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,18,32,0.3)' } }}
                    onMouseLeave={e => { if (s.path) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = s.urgent ? '0 0 20px rgba(255,255,255,0.4)' : 'none' } }}
                    role={s.path ? 'button' : undefined}
                    tabIndex={s.path ? 0 : undefined}
                    onKeyDown={e => { if (s.path && e.key === 'Enter') navigate(s.path) }}
                    aria-label={`${s.label}: ${s.value}`}>
                    <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}>{s.icon}</span>
                    <span style={{ display: 'block', fontSize: '24px', fontWeight: 700, color: s.color, fontFamily: "'Playfair Display', serif" }}>{s.value.toLocaleString()}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {sections.map((section, i) => (
                <div key={i} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '0.75rem' }}>{section.title}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                    {section.items.map(item => (
                      <button key={item.path} onClick={() => navigate(item.path)}
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
                          padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                        <span style={{ fontSize: '22px', flexShrink: 0 }}>{item.emoji}</span>
                        <div>
                          <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: '0 0 2px' }}>{item.label}</p>
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {activeTab === 'admins' && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: 0 }}> Recent Admins</h3>
                <button onClick={() => navigate(ROUTES.ADMINS)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Manage →</button>
              </div>
              {recentAdmins.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>No admins found.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                        {/* FIXED: Removed 'Email' column header */}
                        {['Name', 'Role', 'Joined'].map(h => (
                          <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentAdmins.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#0B1220'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 8px', color: '#FFFFFF' }}>{a.full_name || 'Unnamed'}</td>
                          {/* FIXED: Removed email <td> — email doesn't exist in profiles */}
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ background: a.role === 'super_admin' ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.12)', color: a.role === 'super_admin' ? '#2DD4BF' : '#2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: `1px solid ${a.role === 'super_admin' ? '#2DD4BF' : '#2DD4BF'}` }}>
                              {a.role === 'super_admin' ? ' Super Admin' : ' Admin'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{fmtDate(a.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: 0 }}> System Health</h3>
                {lastChecked && (
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Checked: {lastChecked.toLocaleTimeString('en-KE')}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {systemHealth.map((service, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#0B1220', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{service.icon}</span>
                      <div>
                        <span style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, display: 'block' }}>{service.name}</span>
                        {service.detail && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{service.detail}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthStatusColor(service.status) }} />
                      <span style={{ color: healthStatusColor(service.status), fontSize: '12px', fontWeight: 500 }}>{healthStatusLabel(service.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes urgentPulse { 0%,100%{box-shadow:0 0 12px rgba(255,255,255,0.3)} 50%{box-shadow:0 0 24px rgba(255,255,255,0.6)} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
