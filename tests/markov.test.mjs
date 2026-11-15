import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATES, estimateGenerator, matrixExp, occupancy, expectedClaims, grossPremium, validateQ, validateP, validateCounts } from '../src/lib/markov.js'

const counts = [
  [0, 50, 0, 0],
  [30, 0, 20, 0],
  [0, 10, 0, 15],
  [0, 5, 8, 0],
]
const exposure = [1000, 400, 300, 200]

test('generator rows sum to zero, off-diagonals non-negative', () => {
  const { Q } = estimateGenerator(counts, exposure)
  assert.deepEqual(validateQ(Q), [])
})

test('transition probabilities valid at t=1', () => {
  const { Q } = estimateGenerator(counts, exposure)
  const P = matrixExp(Q, 1)
  assert.deepEqual(validateP(P), [])
})

test('occupancy sums to ~1', () => {
  const { Q } = estimateGenerator(counts, exposure)
  const occ = occupancy([0.7, 0.2, 0.08, 0.02], matrixExp(Q, 1))
  assert.ok(Math.abs(occ.reduce((a, b) => a + b, 0) - 1) < 1e-6)
})

test('impossible transitions rejected', () => {
  const bad = counts.map(r => [...r]); bad[0][3] = 5 // S0->S3 not allowed
  assert.ok(validateCounts(bad).length > 0)
})

test('expected claims scales with member-years', () => {
  const a = expectedClaims({ memberYears: 100, milestoneRates: { entry: .2, course: 1, reengagement: .3 }, benefitAmount: 5000, acceptanceRate: .9 })
  const b = expectedClaims({ memberYears: 200, milestoneRates: { entry: .2, course: 1, reengagement: .3 }, benefitAmount: 5000, acceptanceRate: .9 })
  assert.equal(b, a * 2)
})

test('gross premium separates components, expense null-safe', () => {
  const p = grossPremium({ expectedClaims: 100000, memberYears: 100, expenseRatio: null, adminCostPerMemberYear: 500 })
  assert.equal(p.expense_ratio_available, false)
  assert.equal(p.expense_loading_per_member_year, null)
  assert.ok(p.gross_premium_per_member_year > p.pure_premium_per_member_year)
})
