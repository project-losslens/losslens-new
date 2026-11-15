//  LossLens Protection V2 — four-state Markov modelling (pure JS, no deps).
//  States: S0 no identified harmful gambling, S1 harmful gambling not in
//  treatment, S2 in treatment, S3 post-treatment recovery.
//  Modelling states only — never clinical diagnoses, never assigned to real
//  users from behavioural data. All inputs are aggregate counts/exposure.

export const STATES = ['S0', 'S1', 'S2', 'S3']
export const STATE_LABELS = {
  S0: 'No identified harmful gambling',
  S1: 'Harmful gambling, not in treatment',
  S2: 'In treatment',
  S3: 'Post-treatment recovery',
}
// Allowed transitions (both directions incl. relapse/re-entry).
export const ALLOWED = {
  S0: ['S1'],
  S1: ['S0', 'S2'],
  S2: ['S1', 'S3'],
  S3: ['S1', 'S2'],
}

const N = 4
const idx = (s) => STATES.indexOf(s)

// Build a 4x4 continuous-time generator Q from annual transition counts.
// counts[i][j] = observed transitions i->j; exposure[i] = member-time in state i
// (same time unit as the rates you want — e.g. member-years → rates/year).
// Off-diagonal q_ij = counts_ij / exposure_i; diagonal = -row sum.
export function estimateGenerator(counts, exposure) {
  const Q = Array.from({ length: N }, () => Array(N).fill(0))
  const meta = { rows: [], warnings: [] }
  for (let i = 0; i < N; i++) {
    const from = STATES[i]
    const exp_i = Number(exposure[i]) || 0
    if (exp_i <= 0) { meta.warnings.push(`${from}: zero exposure — row set to absorbing`); continue }
    let rowSum = 0
    for (const to of ALLOWED[from]) {
      const j = idx(to)
      const c = Number(counts[i]?.[j]) || 0
      Q[i][j] = c / exp_i
      rowSum += Q[i][j]
    }
    Q[i][i] = -rowSum
    meta.rows.push({ state: from, exposure: exp_i, total_out_rate: rowSum })
  }
  return { Q, meta }
}

// P(t) = exp(Qt) via uniformization (numerically stable, no deps).
export function matrixExp(Q, t) {
  // uniformization rate
  let lambda = 0
  for (let i = 0; i < N; i++) lambda = Math.max(lambda, -Q[i][i])
  if (lambda === 0) return identity()
  const P = Q.map((row, i) => row.map((q, j) => (i === j ? 1 + q / lambda : q / lambda)))
  const nTerms = Math.max(20, Math.ceil(lambda * t * 4) + 10)
  // result = sum_k pois(k; lambda*t) * P^k
  const pois = (k) => Math.exp(-lambda * t) * Math.pow(lambda * t, k) / factorial(k)
  let result = zero()
  let Pk = identity()
  for (let k = 0; k < nTerms; k++) {
    const w = pois(k)
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) result[i][j] += w * Pk[i][j]
    Pk = matmul(Pk, P)
  }
  return result
}

function matmul(A, B) {
  const C = Array.from({ length: N }, () => Array(N).fill(0))
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    if (A[i][k] === 0) continue
    for (let j = 0; j < N; j++) C[i][j] += A[i][k] * B[k][j]
  }
  return C
}
function identity() { return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0))) }
function zero() { return Array.from({ length: N }, () => Array(N).fill(0)) }
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r }

// State occupancy at time t given initial distribution pi0.
export function occupancy(pi0, P) {
  const pi = Array(N).fill(0)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pi[j] += (pi0[i] || 0) * P[i][j]
  return pi
}

// Expected claims: transitions alone do NOT create claims. Claims arise only
// from verified milestones: entry/course/reengagement events per member-year,
// times benefit utilisation, claim acceptance and average benefit amount.
// milestoneRates: { entry, course, reengagement } per member-year.
// benefitAmount: KES per verified milestone (from approved schedule).
export function expectedClaims({ memberYears, milestoneRates, benefitAmount, acceptanceRate = 1, perEventCap = null, annualCap = null }) {
  const perMemberYear = (milestoneRates.entry || 0) + (milestoneRates.course || 0) + (milestoneRates.reengagement || 0)
  let expected = memberYears * perMemberYear * benefitAmount * acceptanceRate
  if (perEventCap != null) expected = Math.min(expected, memberYears * perMemberYear * perEventCap * acceptanceRate)
  if (annualCap != null) expected = Math.min(expected, memberYears * annualCap)
  return expected
}

// Gross premium build-up. Components are explicit loadings — never summed
// twice. expenseRatio null → expense component reported as unavailable.
export function grossPremium({ expectedClaims, memberYears, expenseRatio = null, adminCostPerMemberYear = 0, acquisitionRatio = 0, riskMarginRatio = 0, contingencyRatio = 0, reinsuranceRatio = 0 }) {
  const claimsPerMY = memberYears > 0 ? expectedClaims / memberYears : 0
  const adminPerMY = adminCostPerMemberYear
  const acquisition = claimsPerMY * acquisitionRatio
  const riskMargin = claimsPerMY * riskMarginRatio
  const contingency = claimsPerMY * contingencyRatio
  const reinsurance = claimsPerMY * reinsuranceRatio
  const expense = expenseRatio == null ? null : claimsPerMY * expenseRatio
  const total = claimsPerMY + (expense ?? 0) + adminPerMY + acquisition + riskMargin + contingency + reinsurance
  return {
    pure_premium_per_member_year: claimsPerMY,
    expense_loading_per_member_year: expense,
    admin_per_member_year: adminPerMY,
    acquisition_per_member_year: acquisition,
    risk_margin_per_member_year: riskMargin,
    contingency_per_member_year: contingency,
    reinsurance_per_member_year: reinsurance,
    gross_premium_per_member_year: total,
    expense_ratio_available: expenseRatio != null,
    total_expected_claims: expectedClaims,
  }
}

// Scenario runner: applies utilisation multipliers to milestone rates.
export function runScenarios(base, variants) {
  // variants: [{ label, multipliers: { entry, course, reengagement }, claimsAdj?, acceptanceRate? }]
  return variants.map(v => {
    const rates = {
      entry: (base.milestoneRates.entry || 0) * (v.multipliers?.entry ?? 1),
      course: (base.milestoneRates.course || 0) * (v.multipliers?.course ?? 1),
      reengagement: (base.milestoneRates.reengagement || 0) * (v.multipliers?.reengagement ?? 1),
    }
    const claims = expectedClaims({
      memberYears: base.memberYears, milestoneRates: rates,
      benefitAmount: base.benefitAmount * (v.claimsAdj ?? 1),
      acceptanceRate: v.acceptanceRate ?? base.acceptanceRate ?? 1,
      perEventCap: base.perEventCap, annualCap: base.annualCap,
    })
    return { label: v.label, milestoneRates: rates, expectedClaims: claims }
  })
}

// Validation helpers for UI + tests.
export function validateCounts(counts) {
  const errors = []
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const v = Number(counts[i]?.[j])
    if (Number.isNaN(v) || v < 0) errors.push(`counts[${i}][${j}] must be a non-negative number`)
    if (i !== j && v > 0 && !ALLOWED[STATES[i]]?.includes(STATES[j])) {
      errors.push(`Transition ${STATES[i]}→${STATES[j]} is not an allowed transition`)
    }
  }
  return errors
}
export function validateQ(Q) {
  const errors = []
  for (let i = 0; i < N; i++) {
    let rowSum = 0
    for (let j = 0; j < N; j++) {
      const q = Q[i][j]
      if (Number.isNaN(q)) { errors.push(`Q[${i}][${j}] is NaN`); continue }
      if (i !== j && q < 0) errors.push(`Q[${i}][${j}] negative off-diagonal`)
      if (i === j && q > 0.000001) errors.push(`Q[${i}][${i}] positive diagonal`)
      rowSum += q
    }
    if (Math.abs(rowSum) > 1e-6) errors.push(`Q row ${i} sums to ${rowSum}, expected 0`)
  }
  return errors
}
export function validateP(P, tol = 1e-6) {
  const errors = []
  for (let i = 0; i < N; i++) {
    let rowSum = 0
    for (let j = 0; j < N; j++) {
      const p = P[i][j]
      if (p < -tol || p > 1 + tol) errors.push(`P[${i}][${j}]=${p} outside [0,1]`)
      rowSum += p
    }
    if (Math.abs(rowSum - 1) > 1e-4) errors.push(`P row ${i} sums to ${rowSum}`)
  }
  return errors
}
