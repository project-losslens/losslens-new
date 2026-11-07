import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function InsurerAnalytics() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('insurer_aggregate_stats').select('*').maybeSingle()
    if (loadError) {
      console.error('Aggregate insurer analytics load failed:', loadError)
      setError('Could not load aggregate insights.')
    } else {
      setStats(data)
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading) return <p role="status">Loading aggregate insights...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Insurer portal</p>
      <h2>Aggregate cohort insights</h2>
      <p>Only grouped, de-identified measures are exposed. Individual diary entries, chats, and screening scores are never available in this portal.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {!error && !stats && <p className="portal-notice" role="status">Insights are withheld until the cohort reaches 10 members.</p>}
      {stats && (
        <>
          <div className="portal-stats">
            <article className="portal-card"><span>Eligible cohort</span><strong>{stats.cohort_size}</strong></article>
            <article className="portal-card"><span>Active members</span><strong>{stats.active_members}</strong></article>
            <article className="portal-card"><span>Claims (30 / 90 days)</span><strong>{stats.claims_last_30d} / {stats.claims_last_90d}</strong></article>
            <article className="portal-card"><span>Paid (90 days)</span><strong>KES {Number(stats.total_paid_last_90d).toLocaleString()}</strong></article>
          </div>
          <section className="portal-card">
            <h3>Aggregate plan mix</h3>
            <pre>{JSON.stringify(stats.tier_mix, null, 2)}</pre>
          </section>
          <section className="portal-card">
            <h3>Aggregate risk-band mix</h3>
            <pre>{JSON.stringify(stats.aggregate_markov_state, null, 2)}</pre>
          </section>
        </>
      )}
    </section>
  )
}
