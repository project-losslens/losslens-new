import test from 'node:test'
import assert from 'node:assert/strict'
import { computeInsurerMetrics, formatMetric, METRIC_DEFINITIONS } from './metrics.js'
import { toCsv } from './csv.js'

const claims = [
  { claim_id: 'c1', session_date: '2026-10-01', claim_amount: 2000, claim_status: 'approved', insurer_status: 'paid', submitted_at: '2026-10-02T00:00:00Z' },
  { claim_id: 'c2', session_date: '2026-10-15', claim_amount: 4000, claim_status: 'approved', insurer_status: 'submitted', submitted_at: '2026-10-16T00:00:00Z' },
  { claim_id: 'c3', session_date: '2026-11-01', claim_amount: 6000, claim_status: 'approved', insurer_status: 'paid', submitted_at: '2026-11-02T00:00:00Z' },
]
const stats = {
  cohort_size: 20,
  active_members: 16,
  claims_last_30d: 2,
  claims_last_90d: 3,
  avg_claim_amount: 4000,
  total_paid_last_90d: 8000,
}

test('computeInsurerMetrics derives the core metrics', () => {
  const m = computeInsurerMetrics({ claims, stats, invoices: [] })
  assert.equal(m.enrolledMembers, 20)
  assert.equal(m.activeMembers, 16)
  assert.equal(m.claimCount, 3)
  assert.equal(m.avgCostPerClaim, 4000)
  assert.equal(m.retention, 80)
  assert.ok(m.claimFrequency > 0)
  assert.equal(m.lossRatio, null) // no invoices in window
})

test('loss ratio uses paid claims over invoiced premium value', () => {
  const invoices = [
    { status: 'paid', total_amount: 50000, invoice_period_end: new Date().toISOString().slice(0, 10) },
    { status: 'draft', total_amount: 99999, invoice_period_end: new Date().toISOString().slice(0, 10) },
  ]
  const m = computeInsurerMetrics({ claims, stats, invoices })
  assert.equal(m.lossRatio, 16) // 8000 / 50000
})

test('monthly trend groups by session month and counts paid value', () => {
  const m = computeInsurerMetrics({ claims, stats, invoices: [] })
  assert.equal(m.monthlyTrend.length, 2)
  const oct = m.monthlyTrend.find((x) => x.month === '2026-10')
  const nov = m.monthlyTrend.find((x) => x.month === '2026-11')
  assert.equal(oct.claims, 2)
  assert.equal(oct.amount, 6000)
  assert.equal(oct.paidAmount, 2000)
  assert.equal(nov.paidAmount, 6000)
})

test('handles empty inputs without NaN', () => {
  const m = computeInsurerMetrics({})
  assert.equal(m.enrolledMembers, null)
  assert.equal(m.avgCostPerClaim, null)
  assert.equal(m.retention, null)
  assert.deepEqual(m.monthlyTrend, [])
  assert.equal(formatMetric(null), '—')
  assert.equal(formatMetric(45.6, 'percent'), '45.6%')
})

test('metric definitions cover every card', () => {
  for (const key of ['enrolledMembers', 'claimFrequency', 'avgCostPerClaim', 'lossRatio', 'retention', 'monthlyTrend']) {
    assert.ok(METRIC_DEFINITIONS[key]?.length > 10, `missing definition: ${key}`)
  }
})

test('toCsv escapes commas, quotes and newlines', () => {
  const csv = toCsv(
    [{ a: 'say "hi"', b: 'x,y', c: 'line\nbreak' }],
    [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
  )
  assert.equal(csv, 'A,B,C\n"say ""hi""","x,y","line\nbreak"')
})
