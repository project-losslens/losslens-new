// Shared insurer metric definitions and computations.
// Plain JS only — no JSX, no import.meta.env — so it is Node-testable.
// Every screen that shows these numbers must use this module so
// definitions never disagree between pages.

export const METRIC_DEFINITIONS = {
  enrolledMembers: 'Eligible cohort — members covered by an active insurer partnership contract (privacy minimum: 10).',
  claimFrequency: 'Claim episodes per member per year — submitted claims divided by enrolled members, annualised over the observed window.',
  avgCostPerClaim: 'Mean claim amount (KES) across all submitted claims, regardless of adjudication status.',
  lossRatio: 'Paid claim value (last 90 days) divided by invoiced premium value for the same period, shown as a percentage.',
  retention: 'Active members divided by enrolled members, as a percentage.',
  monthlyTrend: 'Submitted claims and paid claim value grouped by calendar month of the session date.',
  // Claims-float metrics — shared by Float Management and insurer views.
  floatBalance: 'Current claims-float balance (KES) — funds used to pay approved therapist claims before insurer reimbursement.',
  burnRate30d: 'Total float outflow over the last 30 days (KES).',
  daysUntilDepleted: 'Estimated days until the float reaches zero at the current 30-day burn rate. Shown as "No recent burn" when outflow is zero.',
  pendingReimbursement: 'Total value of insurer invoices awaiting payment or confirmation (KES).',
  outstandingClaims: 'Total value of paid therapist claims not yet reimbursed by an insurer (KES).',
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000))
}

function monthKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * @param {object} input
 * @param {Array}  input.claims   rows from insurer_list_claims()
 * @param {object} input.stats    row from insurer_aggregate_stats (may be null)
 * @param {Array}  input.invoices rows from bulk_invoices (insurer-scoped)
 */
export function computeInsurerMetrics({ claims = [], stats = null, invoices = [] } = {}) {
  const members = stats?.cohort_size ?? null
  const activeMembers = stats?.active_members ?? null

  const amounts = claims.map((c) => Number(c.claim_amount) || 0)
  const avgCostPerClaim = amounts.length
    ? amounts.reduce((a, b) => a + b, 0) / amounts.length
    : null

  // Annualise claim frequency over the observed claim window.
  const dates = claims.map((c) => c.session_date || c.submitted_at).filter(Boolean)
  let claimFrequency = null
  if (members && members > 0 && claims.length > 0 && dates.length) {
    const sorted = dates.map((d) => new Date(d)).sort((a, b) => a - b)
    const windowDays = Math.max(30, daysBetween(sorted[0], new Date()))
    claimFrequency = (claims.length / members) * (365 / windowDays)
  }

  const retention = members && members > 0 && activeMembers != null
    ? (activeMembers / members) * 100
    : null

  // Loss ratio: paid claims (last 90d, from aggregate stats) over invoiced
  // premium value whose period ends within the last 90 days.
  const cutoff = new Date(Date.now() - 90 * 86400000)
  const invoiced90 = invoices
    .filter((inv) => inv.invoice_period_end && new Date(`${inv.invoice_period_end}T00:00:00`) >= cutoff
      && ['sent', 'paid', 'payment_reported'].includes(inv.status))
    .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0)
  const paid90 = Number(stats?.total_paid_last_90d) || 0
  const lossRatio = invoiced90 > 0 ? (paid90 / invoiced90) * 100 : null

  // Monthly trend by session month.
  const trendMap = new Map()
  for (const claim of claims) {
    const key = monthKey(claim.session_date)
    if (!key) continue
    const entry = trendMap.get(key) || { month: key, claims: 0, amount: 0, paidAmount: 0 }
    entry.claims += 1
    entry.amount += Number(claim.claim_amount) || 0
    if (claim.insurer_status === 'paid') entry.paidAmount += Number(claim.claim_amount) || 0
    trendMap.set(key, entry)
  }
  const monthlyTrend = [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month))

  return {
    enrolledMembers: members,
    activeMembers,
    claimCount: claims.length,
    claimFrequency,
    avgCostPerClaim,
    lossRatio,
    retention,
    monthlyTrend,
    paidLast90d: paid90,
    invoicedLast90d: invoiced90,
  }
}

export function formatMetric(value, kind = 'number') {
  if (value == null || Number.isNaN(value)) return '—'
  if (kind === 'percent') return `${value.toFixed(1)}%`
  if (kind === 'frequency') return value.toFixed(2)
  if (kind === 'money') return `KES ${Math.round(value).toLocaleString()}`
  return value.toLocaleString()
}
