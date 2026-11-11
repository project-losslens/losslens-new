import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { computeInsurerMetrics, formatMetric, METRIC_DEFINITIONS } from '../../lib/metrics'
import { toCsv, downloadCsv } from '../../lib/csv'
import { BrandLoader } from '../../components/Brand'

const MIN_COHORT = 10

function MetricCard({ label, value, definition, kind }) {
  return (
    <article className="portal-card">
      <span>{label}</span>
      <strong>{formatMetric(value, kind)}</strong>
      {definition && <details className="metric-def"><summary>Definition</summary><p>{definition}</p></details>}
    </article>
  )
}

export default function InsurerAnalytics() {
  const [stats, setStats] = useState(null)
  const [claims, setClaims] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [statsResult, claimsResult, invoiceResult] = await Promise.all([
      supabase.from('insurer_aggregate_stats').select('*').maybeSingle(),
      supabase.rpc('insurer_list_claims'),
      supabase.from('bulk_invoices')
        .select('id, status, total_claims, total_amount, invoice_period_start, invoice_period_end'),
    ])
    const failure = statsResult.error || claimsResult.error || invoiceResult.error
    if (failure) {
      console.error('Insurer analytics load failed:', failure)
      setError('Could not load analytics. Verify your insurer account is active and try again.')
    } else {
      setStats(statsResult.data)
      setClaims(claimsResult.data || [])
      setInvoices(invoiceResult.data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const metrics = computeInsurerMetrics({ claims, stats, invoices })
  const cohortTooSmall = stats && stats.cohort_size < MIN_COHORT

  const exportClaimsCsv = () => {
    const rows = claims.map((c) => ({
      claim_id: c.claim_id,
      session_date: c.session_date,
      claim_amount: c.claim_amount,
      claim_status: c.claim_status,
      insurer_status: c.insurer_status,
      submitted_at: c.submitted_at,
    }))
    downloadCsv('losslens-claims.csv', toCsv(rows, [
      { key: 'claim_id', label: 'Claim ID' },
      { key: 'session_date', label: 'Session Date' },
      { key: 'claim_amount', label: 'Amount (KES)' },
      { key: 'claim_status', label: 'Claim Status' },
      { key: 'insurer_status', label: 'Insurer Status' },
      { key: 'submitted_at', label: 'Submitted At' },
    ]))
  }

  const exportMetricsCsv = () => {
    const rows = metrics.monthlyTrend.map((m) => ({
      month: m.month,
      claims: m.claims,
      claim_value: m.amount,
      paid_value: m.paidAmount,
    }))
    rows.unshift({
      month: 'summary',
      claims: metrics.claimCount,
      claim_value: metrics.avgCostPerClaim != null ? metrics.avgCostPerClaim * metrics.claimCount : '',
      paid_value: metrics.paidLast90d,
    })
    downloadCsv('losslens-insurer-metrics.csv', toCsv(rows, [
      { key: 'month', label: 'Month' },
      { key: 'claims', label: 'Claims' },
      { key: 'claim_value', label: 'Claim Value (KES)' },
      { key: 'paid_value', label: 'Paid Value (KES)' },
    ]))
  }

  if (loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div>
          <p className="portal-page__eyebrow">Insurer portal</p>
          <h2>Analytics</h2>
        </div>
        <div className="portal-page__actions">
          <button type="button" className="btn-secondary" onClick={exportMetricsCsv} disabled={!stats}>Export metrics CSV</button>
          <button type="button" className="btn-secondary" onClick={exportClaimsCsv} disabled={claims.length === 0}>Export claims CSV</button>
        </div>
      </header>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {!error && !stats && <p className="portal-notice" role="status">Aggregate insights are available once the contracted cohort reaches the privacy minimum.</p>}
      {cohortTooSmall && <p className="portal-notice" role="status">Cohort insights are withheld until at least {MIN_COHORT} members are enrolled.</p>}
      {stats && !cohortTooSmall && (
        <>
          <div className="portal-stats">
            <MetricCard label="Enrolled members" value={metrics.enrolledMembers} definition={METRIC_DEFINITIONS.enrolledMembers} />
            <MetricCard label="Claim frequency" value={metrics.claimFrequency} kind="frequency" definition={METRIC_DEFINITIONS.claimFrequency} />
            <MetricCard label="Avg cost per claim" value={metrics.avgCostPerClaim} kind="money" definition={METRIC_DEFINITIONS.avgCostPerClaim} />
            <MetricCard label="Loss ratio" value={metrics.lossRatio} kind="percent" definition={METRIC_DEFINITIONS.lossRatio} />
            <MetricCard label="Retention" value={metrics.retention} kind="percent" definition={METRIC_DEFINITIONS.retention} />
            <MetricCard label="Active members" value={metrics.activeMembers} />
          </div>
          <section className="portal-card">
            <h3>Monthly trend</h3>
            <p className="portal-page__eyebrow">{METRIC_DEFINITIONS.monthlyTrend}</p>
            {metrics.monthlyTrend.length === 0 ? <p>No claims in the observed period.</p> : (
              <div className="portal-list">
                {metrics.monthlyTrend.map((m) => (
                  <article className="portal-list__item" key={m.month}>
                    <div>
                      <strong>{m.month}</strong>
                      <p>{m.claims} claims · KES {Math.round(m.amount).toLocaleString()} submitted · KES {Math.round(m.paidAmount).toLocaleString()} paid</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="portal-card">
            <h3>Plan mix</h3>
            <pre className="portal-json">{JSON.stringify(stats.tier_mix, null, 2)}</pre>
          </section>
          <section className="portal-card">
            <h3>Aggregate risk-band mix</h3>
            <pre className="portal-json">{JSON.stringify(stats.aggregate_markov_state, null, 2)}</pre>
          </section>
          <p className="portal-notice">Only grouped, de-identified measures are shown. Individual diary entries, chats, and screening scores are never exposed.</p>
        </>
      )}
    </section>
  )
}
