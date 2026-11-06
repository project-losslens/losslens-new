import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import AdminSidebar from '../../components/AdminSidebar'

//  Constants
const DAY_MS = 86400000
const WEEK_DAYS = 7
const MONTH_DAYS = 30
const DIARY_SAMPLE_LIMIT = 500
const STREAK_SAMPLE_LIMIT = 300

export default function UserAnalytics() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({})
  const [featureUsage, setFeatureUsage] = useState([])
  const [riskBreakdown, setRiskBreakdown] = useState([])
  const [weeklyActivity, setWeeklyActivity] = useState([])
  const [topTriggers, setTopTriggers] = useState([])
  const [topCoping, setTopCoping] = useState([])
  const [recentSignups, setRecentSignups] = useState([])

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      const weekAgo = new Date(today.getTime() - WEEK_DAYS * DAY_MS).toISOString()
      const monthAgo = new Date(today.getTime() - MONTH_DAYS * DAY_MS).toISOString()

      //  Batch all queries â€” 15 parallel
      const [
        totalUsersRes, activeTodayRes, activeWeekRes, activeMonthRes,
        highRiskRes, medRiskRes, lowRiskRes,
        totalDiaryRes, diaryTodayRes, cbtDoneRes,
        circleMessagesRes, crisisTotalRes, supportLinksRes,
        diaryEntriesRes, streakDataRes, recentSignupsRes,
        //  Real weekly data â€” 7 individual day queries
        ...weekQueries
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', todayStr),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', weekAgo),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', monthAgo),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'high'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'medium'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('risk_level', 'low'),
        supabase.from('diary_entries').select('*', { count: 'exact', head: true }),
        supabase.from('diary_entries').select('*', { count: 'exact', head: true }).eq('date', todayStr),
        supabase.from('cbt_progress').select('*', { count: 'exact', head: true }).eq('completed', true),
        supabase.from('circle_messages').select('*', { count: 'exact', head: true }),
        supabase.from('crisis_alerts').select('*', { count: 'exact', head: true }),
        supabase.from('supporter_invitations').select('*', { count: 'exact', head: true }),
        supabase.from('diary_entries').select('triggers, coping, mood').limit(DIARY_SAMPLE_LIMIT),
        supabase.from('profiles').select('streak_days, full_name, created_at').order('streak_days', { ascending: false }).limit(STREAK_SAMPLE_LIMIT),
        supabase.from('profiles').select('full_name, created_at').order('created_at', { ascending: false }).limit(5),
        //  Real weekly activity â€” 7 queries, one per day
        ...[...Array(WEEK_DAYS)].map((_, i) => {
          const d = new Date(today.getTime() - (WEEK_DAYS - 1 - i) * DAY_MS)
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          return supabase.from('diary_entries').select('*', { count: 'exact', head: true }).eq('date', dateStr)
        }),
      ])

      const totalUsers = totalUsersRes.count || 0
      const highRisk = highRiskRes.count || 0
      const medRisk = medRiskRes.count || 0
      const lowRisk = lowRiskRes.count || 0

      // Feature usage
      const usage = [
        { feature: ' Diary Entries', count: totalDiaryRes.count || 0, icon: '' },
        { feature: ' CBT Completions', count: cbtDoneRes.count || 0, icon: '' },
        { feature: ' Circle Messages', count: circleMessagesRes.count || 0, icon: '' },
        { feature: 'ðŸ†˜ Crisis Alerts', count: crisisTotalRes.count || 0, icon: 'ðŸ†˜' },
        { feature: ' Family Links', count: supportLinksRes.count || 0, icon: '' },
      ].sort((a, b) => b.count - a.count)

      // Risk breakdown
      const riskData = [
        { label: 'High Risk', count: highRisk, color: '#FFFFFF', icon: '' },
        { label: 'Medium Risk', count: medRisk, color: '#7DBDEE', icon: '' },
        { label: 'Low Risk', count: lowRisk, color: '#2DD4BF', icon: '' },
      ]

      // Top triggers & coping
      const triggerCount = {}; const copingCount = {}
      ;(diaryEntriesRes.data || []).forEach(e => {
        ;(e.triggers || []).forEach(t => { triggerCount[t] = (triggerCount[t] || 0) + 1 })
        ;(e.coping || []).forEach(c => { copingCount[c] = (copingCount[c] || 0) + 1 })
      })
      const triggers = Object.entries(triggerCount).sort((a, b) => b[1] - a[1]).slice(0, 8)
      const coping = Object.entries(copingCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

      //  Real weekly activity
      const weekActivity = weekQueries.map((q, i) => {
        const d = new Date(today.getTime() - (WEEK_DAYS - 1 - i) * DAY_MS)
        return {
          day: d.toLocaleDateString('en-KE', { weekday: 'short' }),
          entries: q.count || 0,
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
          isToday: i === WEEK_DAYS - 1,
        }
      })

      // Streak stats
      const streaks = (streakDataRes.data || []).map(s => s.streak_days || 0)
      const avgStreak = streaks.length ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0
      const maxStreak = streaks.length ? Math.max(...streaks) : 0
      const topStreakUser = streakDataRes.data?.[0]?.full_name || 'N/A'

      setStats({
        totalUsers, activeToday: activeTodayRes.count || 0,
        activeWeek: activeWeekRes.count || 0, activeMonth: activeMonthRes.count || 0,
        avgStreak, maxStreak, topStreakUser,
        diaryToday: diaryTodayRes.count || 0, totalDiary: totalDiaryRes.count || 0,
      })
      setFeatureUsage(usage)
      setRiskBreakdown(riskData)
      setTopTriggers(triggers)
      setTopCoping(coping)
      setWeeklyActivity(weekActivity)
      setRecentSignups(recentSignupsRes.data || [])
    } catch (err) {
      console.error('Analytics fetch error:', err)
      setError('Failed to load analytics. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  //  Memoized max values
  const maxUsage = useMemo(() => Math.max(...featureUsage.map(f => f.count), 1), [featureUsage])
  const maxActivity = useMemo(() => Math.max(...weeklyActivity.map(w => w.entries), 1), [weeklyActivity])
  const maxTrigger = useMemo(() => topTriggers.length > 0 ? topTriggers[0][1] : 1, [topTriggers])

  const StatBox = ({ label, value, sub, color = '#2DD4BF', icon }) => (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '14px', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,18,32,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
      {icon && <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>{icon}</span>}
      <span style={{ display: 'block', fontSize: '24px', fontWeight: 700, color, fontFamily: "'Playfair Display', serif", marginBottom: '4px' }}>{value}</span>
      <span style={{ display: 'block', fontSize: '11px', color: '#2DD4BF' }}>{label}</span>
      {sub && <span style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{sub}</span>}
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <AdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#2DD4BF', fontSize: '13px' }}>Loading analytics...</p>
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
            <button onClick={() => fetchAll()} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #FFFFFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
      <AdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Analytics</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.08)', margin: '2px 0 0' }}>Platform insights Â· {stats.totalUsers} total users</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => fetchAll(true)} disabled={refreshing} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
              {refreshing ? 'â³ Refreshing...' : ' Refresh'}
            </button>
            <button onClick={() => navigate('/admin')} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>â† Back</button>
          </div>
        </nav>

        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>

          {/* Key Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
            <StatBox label="Total Users" value={stats.totalUsers.toLocaleString()} icon="" />
            <StatBox label="Active Today" value={stats.activeToday.toLocaleString()} icon="" color="#2DD4BF" />
            <StatBox label="Active This Week" value={stats.activeWeek.toLocaleString()} icon="" color="#7DBDEE" />
            <StatBox label="Active This Month" value={stats.activeMonth.toLocaleString()} icon="" color="#2DD4BF" />
            <StatBox label="Avg Streak" value={`${stats.avgStreak}d`} sub={`Top: ${stats.maxStreak}d`} icon="" color="#2DD4BF" />
            <StatBox label="Diary Today" value={stats.diaryToday.toLocaleString()} icon="" />
            <StatBox label="Total Diary" value={stats.totalDiary.toLocaleString()} sub="all time" icon="" color="#7DBDEE" />
          </div>

          {/* Risk Breakdown */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}> Risk Level Breakdown</h3>
            {stats.totalUsers === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>No user data available yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                {riskBreakdown.map(r => (
                  <div key={r.label} style={{ background: '#0B1220', border: `1px solid ${r.color}33`, borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
                    <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}>{r.icon}</span>
                    <span style={{ display: 'block', fontSize: '28px', fontWeight: 700, color: r.color, fontFamily: "'Playfair Display', serif" }}>{r.count.toLocaleString()}</span>
                    <span style={{ color: r.color, fontSize: '13px', fontWeight: 500 }}>{r.label}</span>
                    <div style={{ marginTop: '10px', height: '6px', background: 'rgba(255,255,255,0.12)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${stats.totalUsers ? (r.count / stats.totalUsers) * 100 : 0}%`, height: '100%', background: r.color, borderRadius: '3px', transition: 'width 0.6s' }} />
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px', display: 'block' }}>{stats.totalUsers ? Math.round((r.count / stats.totalUsers) * 100) : 0}% of users</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Feature Usage */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}> Feature Usage (All Time)</h3>
            {featureUsage.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>No usage data available.</p>
            ) : (
              featureUsage.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px', minWidth: '24px' }}>{f.icon}</span>
                  <span style={{ color: '#FFFFFF', fontSize: '13px', minWidth: '150px' }}>{f.feature}</span>
                  <div style={{ flex: 1, height: '10px', background: 'rgba(255,255,255,0.12)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${(f.count / maxUsage) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #2DD4BF, #2DD4BF)', borderRadius: '5px', transition: 'width 0.6s' }} role="img" aria-label={`${f.feature}: ${f.count.toLocaleString()}`} />
                  </div>
                  <span style={{ color: '#2DD4BF', fontSize: '13px', minWidth: '60px', textAlign: 'right', fontWeight: 600 }}>{f.count.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>

          {/*  Real Weekly Activity */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}> Diary Activity (Last 7 Days)</h3>
            {weeklyActivity.every(w => w.entries === 0) ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>No diary entries this week.</p>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', height: '120px', padding: '0 0 20px 0' }}>
                  {weeklyActivity.map((w, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#2DD4BF', fontSize: '11px', fontWeight: 600 }}>{w.entries}</span>
                      <div
                        style={{ width: '100%', maxWidth: '50px', height: `${Math.round((w.entries / maxActivity) * 100)}px`, minHeight: w.entries > 0 ? '4px' : '0', background: w.isToday ? '#2DD4BF' : 'linear-gradient(180deg, #2DD4BF, rgba(255,255,255,0.12))', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }}
                        title={`${w.date}: ${w.entries} entries`}
                        role="img"
                        aria-label={`${w.day}: ${w.entries} entries`}
                      />
                      <span style={{ color: w.isToday ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: w.isToday ? 600 : 400 }}>{w.day}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.12)', marginTop: '4px' }} />
              </div>
            )}
          </div>

          {/* Top Triggers & Coping */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {topTriggers.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}> Top Triggers</h3>
                {topTriggers.map(([trigger, count], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ color: '#FFFFFF', fontSize: '12px', minWidth: '130px' }}>{trigger}</span>
                    <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxTrigger) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #2DD4BF, #7DBDEE)', borderRadius: '4px', transition: 'width 0.6s' }} />
                    </div>
                    <span style={{ color: '#2DD4BF', fontSize: '12px', minWidth: '45px', textAlign: 'right', fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
            {topCoping.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px' }}>
                <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}> Top Coping Strategies</h3>
                {topCoping.map(([strategy, count], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ color: '#FFFFFF', fontSize: '12px', minWidth: '130px' }}>{strategy}</span>
                    <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${(count / (topCoping[0]?.[1] || 1)) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #2DD4BF, #2DD4BF)', borderRadius: '4px', transition: 'width 0.6s' }} />
                    </div>
                    <span style={{ color: '#2DD4BF', fontSize: '12px', minWidth: '45px', textAlign: 'right', fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Signups */}
          {recentSignups.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 1rem' }}>ðŸ†• Recent Signups</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {recentSignups.map((u, i) => (
                  <div key={i} style={{ background: '#0B1220', borderRadius: '10px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.12)', minWidth: '180px', flex: 1 }}>
                    <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: '0 0 4px' }}>{u.full_name || 'Anonymous'}</p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{new Date(u.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
      <style>{`
        @keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
