import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import { BrandLoader } from '../../components/Brand'

//  Constants
const LOG_LIMIT = 300
const TABLES = ['all', 'profiles', 'diary_entries', 'events', 'crisis_alerts', 'broadcasts', 'resources', 'groups', 'provider_vouchers', 'provider_claims']
const ACTIONS = ['all', 'INSERT', 'UPDATE', 'DELETE']

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'

//  Proper CSV escaping
function escapeCSV(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function exportToCSV(logs, filename) {
  const headers = ['Timestamp', 'Action', 'Table', 'Record ID', 'Actor ID', 'Metadata']
  const rows = logs.map(l => [
    fmtDateTime(l.created_at),
    l.action,
    l.target_table,
    l.target_id || '',
    l.actor_id || '',
    l.metadata ? JSON.stringify(l.metadata) : '',
  ].map(escapeCSV).join(','))

  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditLogs() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const userFilter = params.get('user') || ''
  const validUser = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userFilter)
  const [accountActivity, setAccountActivity] = useState(null)
  const [activityUnavailable, setActivityUnavailable] = useState(false)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [expandedAll, setExpandedAll] = useState(false)
  const [expandedIds, setExpandedIds] = useState({})
  const requestVersion = useRef(0)
  const live = !userFilter && filter === 'all' && actionFilter === 'all' && dateRange === 'all'

  const fetchLogs = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError(null)
    setLogs([])
    setAccountActivity(null)
    setActivityUnavailable(false)
    try {
      if (userFilter && !validUser) {
        setLogs([])
        setError('Invalid account filter.')
        return
      }
      const columns = userFilter ? 'id, actor_id, action, target_table, target_id, created_at' : '*'
      let query = supabase.from('audit_logs').select(columns).order('created_at', { ascending: false }).limit(LOG_LIMIT)
      if (userFilter) query = query.or(`actor_id.eq.${userFilter},and(target_table.eq.profiles,target_id.eq.${userFilter})`)

      //  Server-side filters
      if (filter !== 'all') query = query.eq('target_table', filter)
      if (actionFilter !== 'all') query = query.eq('action', actionFilter)

      // Date range
      if (dateRange === 'today') {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        query = query.gte('created_at', today.toISOString())
      } else if (dateRange === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 86400000)
        query = query.gte('created_at', weekAgo.toISOString())
      } else if (dateRange === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 86400000)
        query = query.gte('created_at', monthAgo.toISOString())
      }

      const [result, activity] = await Promise.all([
        query,
        userFilter ? supabase.rpc('super_admin_account_activity', { p_user_id: userFilter }).maybeSingle() : null,
      ])
      if (version !== requestVersion.current) return
      if (activity) {
        setAccountActivity(activity.data)
        setActivityUnavailable(Boolean(activity.error))
      }
      const { data, error: fetchError } = result
      if (fetchError) throw fetchError
      setLogs(data || [])
    } catch (err) {
      if (version !== requestVersion.current) return
      console.error('Audit log fetch error:', err)
      setError('Failed to load audit logs.')
    } finally { if (version === requestVersion.current) setLoading(false) }
  }, [filter, actionFilter, dateRange, userFilter, validUser])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  //  Real-time subscription
  useEffect(() => {
    if (!live) return
    const channel = supabase.channel('audit_logs_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setLogs(prev => [payload.new, ...prev].slice(0, LOG_LIMIT))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [live])

  const handleExport = () => {
    exportToCSV(logs, `audit-logs-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleExpandAll = () => {
    if (expandedAll) {
      setExpandedIds({})
      setExpandedAll(false)
    } else {
      const all = {}
      logs.forEach(l => { all[l.id] = true })
      setExpandedIds(all)
      setExpandedAll(true)
    }
  }

  //  Client-side search (after server filters)
  const filteredLogs = useMemo(() => {
    if (!search) return logs
    const q = search.toLowerCase()
    return logs.filter(l =>
      (l.actor_id || '').toLowerCase().includes(q) ||
      (l.target_table || '').toLowerCase().includes(q) ||
      (l.target_id || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  const actionColor = (action) => {
    if (action === 'DELETE') return { color: 'var(--text)', bg: 'rgba(255,255,255,0.13)' }
    if (action === 'INSERT') return { color: 'var(--primary)', bg: 'rgba(255,255,255,0.04)' }
    if (action === 'UPDATE') return { color: 'var(--primary)', bg: 'rgb(var(--primary-rgb) / 0.13)' }
    return { color: 'var(--info)', bg: 'transparent' }
  }

  const btnStyle = (isActive, color = 'var(--primary)') => ({
    padding: '5px 12px', borderRadius: '100px',
    border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.12)'}`,
    background: isActive ? 'var(--bg)' : 'transparent',
    color: isActive ? color : 'rgba(255,255,255,0.4)',
    fontSize: '11px', cursor: 'pointer',
    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>

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
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchLogs} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--text)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Retry</button>
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
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}> Audit Logs</h2>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>{logs.length} events · {live ? 'Live monitoring' : 'Filtered view'}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExport} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Export CSV</button>
            <button onClick={fetchLogs} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid var(--info)', color: 'var(--info)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Refresh</button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '100%' }}>
          {userFilter && (
            <section className="card" aria-label="Account activity">
              <h3>Account activity</h3>
              <p>Account: {userFilter} · <Link to="/super-admin/logs">View all audit logs</Link></p>
              {activityUnavailable ? <p role="status">Session activity is unavailable. Check that migration 12 has been applied.</p> : !loading && (
                <dl>
                  <dt>Latest sign-in</dt><dd>{accountActivity?.last_sign_in_at ? fmtDateTime(accountActivity.last_sign_in_at) : 'Not recorded'}</dd>
                  <dt>Last seen in the app (approximate)</dt><dd>{accountActivity?.last_seen_at ? fmtDateTime(accountActivity.last_seen_at) : 'Not recorded'}</dd>
                  <dt>Last sign-out requested</dt><dd>{accountActivity?.last_sign_out_requested_at ? fmtDateTime(accountActivity.last_sign_out_requested_at) : 'Not recorded'}</dd>
                </dl>
              )}
              <p>Shows recorded changes made by this account or made to its profile. Closing the app or losing a connection does not record a sign-out.</p>
            </section>
          )}
          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder=" Search logs..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '200px', maxWidth: '280px', padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)' }} />

            {/* Date Range */}
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none' }}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>

            <button onClick={toggleExpandAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              {expandedAll ? ' Collapse all' : ' Expand all'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {/* Table filter */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginRight: '4px' }}>Table:</span>
              {TABLES.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={btnStyle(filter === t, 'var(--primary)')}>
                  {t === 'all' ? 'All' : t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            {/* Action filter */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginRight: '4px' }}>Action:</span>
              {ACTIONS.map(a => (
                <button key={a} onClick={() => setActionFilter(a)} style={btnStyle(actionFilter === a, actionColor(a).color)}>
                  {a === 'all' ? 'All' : a}
                </button>
              ))}
            </div>
          </div>

          {/* Log list */}
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <AppIcon name="document" size={48} style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--primary)', fontSize: '14px' }}>No logs found.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredLogs.map(log => {
                const ac = actionColor(log.action)
                const isExpanded = expandedIds[log.id]
                return (
                  <div key={log.id} style={{ background: ac.bg, border: `1px solid ${isExpanded ? ac.color : 'rgba(255,255,255,0.12)'}`, borderRadius: '10px', padding: '12px 16px', transition: 'border-color 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: isExpanded ? '8px' : '0' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ background: 'var(--bg)', color: ac.color, border: `1px solid ${ac.color}33`, padding: '2px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600 }}>
                          {log.action}
                        </span>
                        <span style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 500 }}>{log.target_table?.replace(/_/g, ' ')}</span>
                        {log.target_id && <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>ID: {log.target_id.slice(0, 12)}</span>}
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{fmtDateTime(log.created_at)}</span>
                      </div>
                      <button onClick={() => toggleExpand(log.id)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        {isExpanded ? '▲ Hide' : '▼ Details'}
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                        {log.actor_id && <span style={{ color: 'var(--primary)', fontSize: '11px' }}> {log.actor_id}</span>}
                        {log.metadata && (
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500 }}> Metadata:</span>
                            <pre style={{ color: 'var(--info)', fontSize: '11px', margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg)', padding: '8px 10px', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
