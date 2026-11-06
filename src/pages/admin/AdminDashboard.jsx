import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

//  Constants
const ROUTES = {
  EVENTS: '/admin/events', GROUPS: '/admin/groups', RESOURCES: '/admin/resources',
  BROADCAST: '/admin/broadcast', ANALYTICS: '/admin/analytics', CRISIS: '/admin/crisis',
  USERS: '/super-admin/users', ADMIN: '/admin',
}

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    totalUsers: 0, activeToday: 0, highRisk: 0,
    crisisOpen: 0, eventsActive: 0, resources: 0,
    cbtCompletions: 0, diaryEntriesToday: 0,
    circleMessagesToday: 0, supportersActive: 0,
  })
  const [alerts, setAlerts] = useState([])
  const [recentUsers, setRecentUsers] = useState([])
  const [topTriggers, setTopTriggers] = useState([])
  const [contactRequests, setContactRequests] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [alertPolling, setAlertPolling] = useState(true)
  const [revealedEmails, setRevealedEmails] = useState({})
  const [revealedPhones, setRevealedPhones] = useState({})

  //  Auto-poll crisis alerts every 30s
  useEffect(() => {
    if (!alertPolling) return
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.from('crisis_alerts').select('*, profiles(full_name, username)').eq('resolved', false).order('created_at', { ascending: false }).limit(5)
        if (data) setAlerts(data)
      } catch (err) { /* silent */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [alertPolling])

  //  Realtime crisis alerts
  useEffect(() => {
    const channel = supabase.channel('admin_crisis')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crisis_alerts', filter: 'resolved=eq.false' }, (payload) => {
        setAlerts(prev => [payload.new, ...prev].slice(0, 5))
        setStats(prev => ({ ...prev, crisisOpen: prev.crisisOpen + 1 }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = new Date().toISOString().split('T')[0]

      const [
        totalUsersRes, activeTodayRes, highRiskRes,
        crisisOpenRes, eventsActiveRes, resourcesRes,
        cbtRes, diaryTodayRes, circleRes, supportersRes,
        recentUsersRes, crisisAlertsRes, contactRes, diaryEntriesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', today),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'high'),
        supabase.from('crisis_alerts').select('*', { count: 'exact', head: true }).eq('resolved', false),
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('resources').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('completed', true),
        supabase.from('diary_entries').select('*', { count: 'exact', head: true }).eq('date', today),
        supabase.from('circle_messages').select('*', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('supporter_invitations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('id, full_name, username, email, risk_level, streak_days, last_active, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('crisis_alerts').select('*, profiles(full_name, username)').eq('resolved', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('event_messages').select('*, events(title), profiles(full_name, phone, email)').order('created_at', { ascending: false }).limit(10),
        supabase.from('diary_entries').select('triggers').limit(200),
      ])

      // Top triggers
      const triggerCount = {}
      ;(diaryEntriesRes.data || []).forEach(e => {
        ;(e.triggers || []).forEach(t => { triggerCount[t] = (triggerCount[t] || 0) + 1 })
      })
      const sortedTriggers = Object.entries(triggerCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

      setStats({
        totalUsers: totalUsersRes.count || 0, activeToday: activeTodayRes.count || 0,
        highRisk: highRiskRes.count || 0, crisisOpen: crisisOpenRes.count || 0,
        eventsActive: eventsActiveRes.count || 0, resources: resourcesRes.count || 0,
        cbtCompletions: cbtRes.count || 0, diaryEntriesToday: diaryTodayRes.count || 0,
        circleMessagesToday: circleRes.count || 0, supportersActive: supportersRes.count || 0,
      })
      setRecentUsers(recentUsersRes.data || [])
      setAlerts(crisisAlertsRes.data || [])
      setTopTriggers(sortedTriggers)
      setContactRequests(contactRes.data || [])
    } catch (err) {
      console.error('Admin fetch error:', err)
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  //  Toggle PII reveal
  const toggleReveal = (type, id) => {
    if (type === 'email') setRevealedEmails(prev => ({ ...prev, [id]: !prev[id] }))
    if (type === 'phone') setRevealedPhones(prev => ({ ...prev, [id]: !prev[id] }))
  }

  //  Mask PII
  const maskEmail = (email) => {
    if (!email || !email.includes('@')) return email
    const [name, domain] = email.split('@')
    return name.substring(0, 1) + '***@' + domain
  }
  const maskPhone = (phone) => {
    if (!phone) return phone
    return phone.substring(0, 4) + ' *** ****'
  }

  const statsCards = useMemo(() => [
    { label: 'Total Users', value: stats.totalUsers, icon: '', color: '#2DD4BF', path: ROUTES.USERS },
    { label: 'Active Today', value: stats.activeToday, icon: '', color: '#2DD4BF' },
    { label: 'High Risk', value: stats.highRisk, icon: '', color: '#FFFFFF', urgent: stats.highRisk > 0, path: ROUTES.USERS },
    { label: 'Crisis Open', value: stats.crisisOpen, icon: 'ðŸ†˜', color: '#FFFFFF', urgent: stats.crisisOpen > 0, path: ROUTES.CRISIS },
    { label: 'Active Events', value: stats.eventsActive, icon: '', color: '#7DBDEE', path: ROUTES.EVENTS },
    { label: 'Resources', value: stats.resources, icon: '', color: '#7DBDEE', path: ROUTES.RESOURCES },
    { label: 'CBT Done', value: stats.cbtCompletions, icon: '', color: '#2DD4BF' },
    { label: 'Diary Today', value: stats.diaryEntriesToday, icon: '', color: '#2DD4BF' },
  ], [stats])

  const quickActions = [
    { emoji: '', label: 'Manage Events', path: ROUTES.EVENTS, desc: 'Create, edit, view RSVPs' },
    { emoji: '', label: 'Manage Groups', path: ROUTES.GROUPS, desc: 'Circle & community oversight' },
    { emoji: '', label: 'Manage Resources', path: ROUTES.RESOURCES, desc: 'Helplines & content' },
    { emoji: '', label: 'Broadcast', path: ROUTES.BROADCAST, desc: 'Send announcements' },
    { emoji: '', label: 'Analytics', path: ROUTES.ANALYTICS, desc: 'Platform insights' },
    { emoji: 'ðŸ†˜', label: 'Crisis Alerts', path: ROUTES.CRISIS, desc: `${stats.crisisOpen} open` },
  ]

  const getRiskColor = (level) => {
    if (level === 'high') return { bg: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '#FFFFFF' }
    if (level === 'medium') return { bg: 'rgba(45,212,191,0.15)', color: '#7DBDEE', border: '#7DBDEE' }
    return { bg: 'rgba(255,255,255,0.12)', color: '#2DD4BF', border: '#2DD4BF' }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFFFFF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.08)', fontSize: '13px' }}>Loading admin panel...</p>
          </div>
          <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
        </div>
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
            <button onClick={fetchAllData} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #FFFFFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Retry</button>
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
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Admin Dashboard</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.08)', margin: '2px 0 0' }}>{stats.totalUsers} users  · {stats.activeToday} active today</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAllData} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> User App</button>
            <button onClick={() => navigate('/')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Exit Admin</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: ' Overview' },
              { id: 'users', label: ' Recent Users' },
              { id: 'alerts', label: `ðŸ†˜ Alerts (${stats.crisisOpen})` },
              { id: 'messages', label: ` Messages (${contactRequests.length})` },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minWidth: '100px', transition: 'background 0.2s, color 0.2s' }}>{tab.label}</button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginBottom: '1.5rem' }}>
                {statsCards.map((s, i) => (
                  <div key={i} onClick={() => s.path && navigate(s.path)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${s.urgent ? '#FFFFFF' : 'rgba(255,255,255,0.12)'}`, borderRadius: '12px', padding: '14px', textAlign: 'center', cursor: s.path ? 'pointer' : 'default', boxShadow: s.urgent ? '0 0 16px rgba(255,255,255,0.3)' : 'none', animation: s.urgent ? 'urgentPulse 2s ease-in-out infinite' : 'none', transition: 'transform 0.2s, box-shadow 0.2s' }}
                    onMouseEnter={e => { if (s.path) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,18,32,0.3)' } }}
                    onMouseLeave={e => { if (s.path) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = s.urgent ? '0 0 16px rgba(255,255,255,0.3)' : 'none' } }}>
                    <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}>{s.icon}</span>
                    <span style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: "'Playfair Display', serif" }}>{s.value.toLocaleString()}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '0.75rem' }}> Quick Actions</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                  {quickActions.map(a => (
                    <button key={a.path} onClick={() => navigate(a.path)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                      <span style={{ fontSize: '24px', flexShrink: 0 }}>{a.emoji}</span>
                      <div><p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: '0 0 2px' }}>{a.label}</p><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{a.desc}</p></div>
                    </button>
                  ))}
                </div>
              </div>

              {topTriggers.length > 0 && (
                <div className="dash-section" style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '0.75rem' }}> Top Triggers Across Users</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topTriggers.map(([trigger, count], i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#2DD4BF', fontSize: '12px', minWidth: '120px' }}>{trigger}</span>
                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.12)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${(count / topTriggers[0][1]) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #2DD4BF, #7DBDEE)', borderRadius: '3px' }} />
                        </div>
                        <span style={{ color: '#2DD4BF', fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="dash-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '14px', margin: 0 }}> Recent Users</h3>
                <button onClick={() => navigate(ROUTES.USERS)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Manage Users â†’</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                      {['User', 'Email', 'Risk', 'Streak', 'Last Active', 'Joined'].map(h => (
                        <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentUsers.map(u => {
                      const risk = getRiskColor(u.risk_level)
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#0B1220'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 8px', color: '#FFFFFF' }}>{u.full_name || u.username || 'Anonymous'}</td>
                          <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', cursor: 'pointer' }}
                            onClick={() => toggleReveal('email', u.id)} title="Click to reveal">
                            {revealedEmails[u.id] ? u.email : maskEmail(u.email)}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ background: risk.bg, color: risk.color, padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: `1px solid ${risk.border}` }}>
                              {u.risk_level ? u.risk_level.toUpperCase() : 'N/A'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', color: '#2DD4BF', fontWeight: 600 }}> {u.streak_days || 0}</td>
                          <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{fmtTime(u.last_active)}</td>
                          <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{fmtDate(u.created_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="dash-section" style={{ borderColor: stats.crisisOpen > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: stats.crisisOpen > 0 ? '#FFFFFF' : '#FFFFFF', fontSize: '14px', margin: 0 }}>ðŸ†˜ Crisis Alerts {stats.crisisOpen > 0 && `(${stats.crisisOpen} open)`}</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setAlertPolling(!alertPolling)} style={{ padding: '4px 10px', borderRadius: '100px', background: 'transparent', border: `1px solid ${alertPolling ? '#2DD4BF' : 'rgba(255,255,255,0.4)'}`, color: alertPolling ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{alertPolling ? ' Live' : 'â¸ Paused'}</button>
                  <button onClick={() => navigate(ROUTES.CRISIS)} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #FFFFFF', color: '#FFFFFF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Manage â†’</button>
                </div>
              </div>
              {alerts.length === 0 ? (
                <p style={{ color: '#2DD4BF', fontSize: '13px', textAlign: 'center', padding: '2rem' }}> No open crisis alerts</p>
              ) : (
                <div className="entries-list">
                  {alerts.map((a, i) => (
                    <div key={i} className="entry-item" style={{ borderColor: 'rgba(255,255,255,0.08)', animation: 'urgentPulse 2s ease-in-out infinite' }}>
                      <div className="entry-top">
                        <span className="entry-date">{a.profiles?.full_name || a.profiles?.username || `User #${a.user_id?.slice(0, 8)}`}</span>
                        <span className="entry-status gambled"> Crisis</span>
                      </div>
                      {a.keyword && <p style={{ color: '#FFFFFF', fontSize: '11px', margin: '4px 0' }}>Keyword: "{a.keyword}"</p>}
                      <p className="entry-note" style={{ color: 'rgba(255,255,255,0.4)' }}>{fmtTime(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MESSAGES TAB */}
          {activeTab === 'messages' && (
            <div className="dash-section">
              <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '1rem' }}> Recent Contact Requests</h3>
              {contactRequests.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '2rem' }}>No contact requests yet</p>
              ) : (
                <div className="entries-list">
                  {contactRequests.map((c, i) => (
                    <div key={i} className="entry-item" style={{ transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0B1220'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className="entry-top">
                        <span className="entry-date">{c.name || c.profiles?.full_name || 'User'}</span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(c.created_at)}</span>
                      </div>
                      <p className="entry-note">{c.message?.substring(0, 100)}</p>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                        {c.email && <span style={{ color: '#2DD4BF', fontSize: '11px', cursor: 'pointer' }} onClick={() => toggleReveal('email', c.id)}> {revealedEmails[c.id] ? c.email : maskEmail(c.email)}</span>}
                        {c.phone && <span style={{ color: '#2DD4BF', fontSize: '11px', cursor: 'pointer' }} onClick={() => toggleReveal('phone', c.id)}> {revealedPhones[c.id] ? c.phone : maskPhone(c.phone)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes urgentPulse { 0%,100%{box-shadow:0 0 8px rgba(255,255,255,0.2)} 50%{box-shadow:0 0 20px rgba(255,255,255,0.5)} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
