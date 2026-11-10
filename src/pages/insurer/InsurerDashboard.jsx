import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { METRIC_DEFINITIONS } from '../../lib/metrics'

export default function InsurerDashboard() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [stats, setStats] = useState(null)
  const [claims, setClaims] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const [statsResult, claimsResult, invoiceResult] = await Promise.all([
      supabase.from('insurer_aggregate_stats').select('*').maybeSingle(),
      supabase.rpc('insurer_list_claims'),
      supabase.from('bulk_invoices').select('id, status, total_claims, total_amount, invoice_period_start, invoice_period_end')
        .order('invoice_period_end', { ascending: false }).limit(5),
    ])
    const failure = statsResult.error || claimsResult.error || invoiceResult.error
    if (failure) {
      console.error('Insurer dashboard load failed:', failure)
      setError('Could not load insurer information. Verify your insurer account is active and try again.')
    } else {
      setStats(statsResult.data)
      setClaims(claimsResult.data || [])
      setInvoices(invoiceResult.data || [])
      setError('')
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading) return <p role="status">Loading insurer dashboard...</p>
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Claims and coverage overview</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {!error && !stats && <p className="portal-notice" role="status">Aggregate insights are available once the contracted cohort reaches the privacy minimum.</p>}
      {stats && (
        <div className="portal-stats">
          <article className="portal-card"><span>Eligible cohort</span><strong>{stats.cohort_size}</strong></article>
          <article className="portal-card"><span>Active members</span><strong>{stats.active_members}</strong></article>
          <article className="portal-card"><span>Claims, 30 days</span><strong>{stats.claims_last_30d}</strong></article>
          <article className="portal-card"><span>Average claim</span><strong>KES {Number(stats.avg_claim_amount).toLocaleString()}</strong><details className="metric-def"><summary>Definition</summary><p>{METRIC_DEFINITIONS.avgCostPerClaim}</p></details></article>
        </div>
      )}
      <section className="portal-card">
        <div className="portal-page__heading"><h3>Claims awaiting review</h3><Link to="/insurer/claims">Review claims</Link></div>
        <p>{claims.filter((claim) => claim.insurer_status === 'submitted').length} submitted claims require adjudication.</p>
      </section>
      <section className="portal-card">
        <div className="portal-page__heading"><h3>Recent invoices</h3><Link to="/insurer/invoices">View invoices</Link></div>
        {invoices.length === 0 ? <p>No invoices are available.</p> : (
          <div className="portal-list">
            {invoices.map((invoice) => (
              <article className="portal-list__item" key={invoice.id}>
                <div><strong>{invoice.status}</strong><p>{invoice.total_claims} claims · KES {Number(invoice.total_amount).toLocaleString()}</p></div>
                <span>{invoice.invoice_period_start} – {invoice.invoice_period_end}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
