import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

//  Constants
const LOG_LIMIT = 300
const TABLES = ['all', 'profiles', 'diary_entries', 'events', 'crisis_alerts', 'broadcasts', 'resources', 'groups']
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
  const headers = ['Timestamp', 'Action', 'Table', 'Record ID', 'Performed By', 'Metadata']
  const rows = logs.map(l => [
    fmtDateTime(l.created_at),
    l.action,
    l.table_name,
    l.record_id || '',
    l.performed_by || '',
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
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [expandedAll, setExpandedAll] = useState(false)
  const [expandedIds, setExpandedIds] = useState({})

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(LOG_LIMIT)

      //  Server-side filters
      if (filter !== 'all') query = query.eq('table_name', filter)
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

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      setLogs(data || [])
    } catch (err) {
      console.error('Audit log fetch error:', err)
      setError('Failed to load audit logs.')
    } finally { setLoading(false) }
  }, [filter, actionFilter, dateRange])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  //  Real-time subscription
  useEffect(() => {
    const channel = supabase.channel('audit_logs_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setLogs(prev => [payload.new, ...prev].slice(0, LOG_LIMIT))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

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
      (l.performed_by || '').toLowerCase().includes(q) ||
      (l.table_name || '').toLowerCase().includes(q) ||
      (l.record_id || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  const actionColor = (action) => {
    if (action === 'DELETE') return { color: '#FFFFFF', bg: 'rgba(255,255,255,0.13)' }
    if (action === 'INSERT') return { color: '#2DD4BF', bg: 'rgba(255,255,255,0.04)' }
    if (action === 'UPDATE') return { color: '#2DD4BF', bg: 'rgba(45,212,191,0.13)' }
    return { color: '#7DBDEE', bg: 'transparent' }
  }

  const btnStyle = (isActive, color = '#2DD4BF') => ({
    padding: '5px 12px', borderRadius: '100px',
    border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.12)'}`,
    background: isActive ? '#0B1220' : 'transparent',
    color: isActive ? color : 'rgba(255,255,255,0.4)',
    fontSize: '11px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading audit logs...</p>
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
            <button onClick={fetchLogs} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #FFFFFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid #2DD4BF', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#2DD4BF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Audit Logs</h1>
            <p style={{ fontSize: '12px', color: '#7DBDEE', margin: '2px 0 0' }}>{logs.length} events  · Live monitoring</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExport} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Export CSV</button>
            <button onClick={fetchLogs} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #7DBDEE', color: '#7DBDEE', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder=" Search logs..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '200px', maxWidth: '280px', padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />

            {/* Date Range */}
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', fontFamily: "'Inter', sans-serif", cursor: 'pointer', outline: 'none' }}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>

            <button onClick={toggleExpandAll} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
              {expandedAll ? ' Collapse all' : ' Expand all'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {/* Table filter */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginRight: '4px' }}>Table:</span>
              {TABLES.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={btnStyle(filter === t, '#2DD4BF')}>
                  {t === 'all' ? 'All' : t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            {/* Action filter */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginRight: '4px' }}>Action:</span>
              {ACTIONS.map(a => (
                <button key={a} onClick={() => setActionFilter(a)} style={btnStyle(actionFilter === a, actionColor(a).color)}>
                  {a === 'all' ? 'All' : a}
                </button>
              ))}
            </div>
          </div>

          {/* Log list */}
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>No logs found.</p>
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
                        <span style={{ background: '#0B1220', color: ac.color, border: `1px solid ${ac.color}33`, padding: '2px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600 }}>
                          {log.action}
                        </span>
                        <span style={{ color: '#2DD4BF', fontSize: '12px', fontWeight: 500 }}>{log.table_name?.replace(/_/g, ' ')}</span>
                        {log.record_id && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: 'monospace' }}>ID: {log.record_id.slice(0, 12)}</span>}
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{fmtDateTime(log.created_at)}</span>
                      </div>
                      <button onClick={() => toggleExpand(log.id)} style={{ background: 'transparent', border: 'none', color: '#2DD4BF', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                        {isExpanded ? 'â–² Hide' : 'â–¼ Details'}
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                        {log.performed_by && <span style={{ color: '#2DD4BF', fontSize: '11px' }}> {log.performed_by}</span>}
                        {log.metadata && (
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 500 }}> Metadata:</span>
                            <pre style={{ color: '#7DBDEE', fontSize: '11px', margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#0B1220', padding: '8px 10px', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
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
