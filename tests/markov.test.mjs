import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATES, estimateGenerator, matrixExp, occupancy, expectedClaims, grossPremium,
  validateQ, validateP, validateCounts, validateProbabilityVector,
} from '../src/lib/markov.js'

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

test('uniformization agrees with an analytical two-state CTMC', () => {
  const forward = 0.7
  const backward = 0.3
  const horizon = 2
  const Q = [
    [-forward, forward, 0, 0],
    [backward, -backward, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const P = matrixExp(Q, horizon)
  const expectedP00 = backward / (forward + backward)
    + forward / (forward + backward) * Math.exp(-(forward + backward) * horizon)
  assert.ok(Math.abs(P[0][0] - expectedP00) < 1e-12)
  assert.ok(Math.abs(P[0][1] - (1 - expectedP00)) < 1e-12)
})

test('uniformization remains stochastic for a long horizon and high rates', () => {
  const Q = [
    [-40, 40, 0, 0],
    [20, -35, 15, 0],
    [0, 10, -30, 20],
    [0, 5, 15, -20],
  ]
  const P = matrixExp(Q, 100)
  assert.deepEqual(validateP(P), [])
  for (const row of P) assert.ok(Math.abs(row.reduce((sum, p) => sum + p, 0) - 1) < 1e-10)
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

test('invalid exposure, self-transition counts, and initial distributions are rejected', () => {
  assert.throws(() => estimateGenerator(counts, [1000, 0, 300, 200]), /positive transitions require positive exposure/)
  const selfTransition = counts.map(r => [...r]); selfTransition[0][0] = 1
  assert.ok(validateCounts(selfTransition).some(error => error.includes('self-transitions')))
  assert.ok(validateProbabilityVector([0.5, 0.5, 0.5, 0]).length > 0)
  assert.throws(() => occupancy([0.5, 0.5, 0.5, 0], matrixExp(estimateGenerator(counts, exposure).Q, 1)), /sum to/)
})

test('expected claims scales with member-years', () => {
  const a = expectedClaims({ memberYears: 100, milestoneRates: { entry: .2, course: 1, reengagement: .3 }, benefitAmount: 5000, acceptanceRate: .9 })
  const b = expectedClaims({ memberYears: 200, milestoneRates: { entry: .2, course: 1, reengagement: .3 }, benefitAmount: 5000, acceptanceRate: .9 })
  assert.equal(b, a * 2)
})

test('claims assumptions reject invalid probabilities and negative values', () => {
  assert.throws(() => expectedClaims({
    memberYears: 100, milestoneRates: { entry: 0.2 }, benefitAmount: 5000, acceptanceRate: 1.1,
  }), /acceptance must be in \[0,1\]/)
  assert.throws(() => expectedClaims({
    memberYears: 100, milestoneRates: { entry: -0.2 }, benefitAmount: 5000,
  }), /finite and non-negative/)
})

test('gross premium separates components, expense null-safe', () => {
  const p = grossPremium({ expectedClaims: 100000, memberYears: 100, expenseRatio: null, adminCostPerMemberYear: 500 })
  assert.equal(p.expense_ratio_available, false)
  assert.equal(p.expense_loading_per_member_year, null)
  assert.equal(p.gross_premium_per_member_year, null)
  assert.ok(p.known_subtotal_excluding_unavailable_expense_per_member_year > p.pure_premium_per_member_year)
})

test('premium assumptions reject invalid ratios', () => {
  assert.throws(() => grossPremium({
    expectedClaims: 100000, memberYears: 100, expenseRatio: 1.1,
  }), /expense ratio must be in \[0,1\]/)
})
