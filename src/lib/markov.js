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
  const countErrors = validateCounts(counts)
  if (countErrors.length) throw new RangeError(countErrors[0])
  if (!Array.isArray(exposure) || exposure.length !== N) {
    throw new RangeError(`exposure must contain ${N} state values`)
  }
  const exposures = exposure.map(Number)
  if (exposures.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Exposure values must be finite and non-negative')
  }

  const Q = Array.from({ length: N }, () => Array(N).fill(0))
  const meta = { rows: [], warnings: [] }
  for (let i = 0; i < N; i++) {
    const from = STATES[i]
    const exp_i = exposures[i]
    if (exp_i === 0) {
      if (ALLOWED[from].some(to => Number(counts[i][idx(to)]) > 0)) {
        throw new RangeError(`${from}: positive transitions require positive exposure`)
      }
      meta.warnings.push(`${from}: zero exposure — row set to absorbing`)
      continue
    }
    let rowSum = 0
    for (const to of ALLOWED[from]) {
      const j = idx(to)
      const c = Number(counts[i][j])
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
  const qErrors = validateQ(Q)
  if (qErrors.length) throw new RangeError(qErrors[0])
  if (!Number.isFinite(t) || t < 0) throw new RangeError('Projection horizon must be finite and non-negative')

  let lambda = 0
  for (let i = 0; i < N; i++) lambda = Math.max(lambda, -Q[i][i])
  if (lambda === 0 || t === 0) return identity()

  const totalMean = lambda * t
  const pieces = Math.ceil(totalMean / 20)
  if (!Number.isSafeInteger(pieces) || pieces > 1_000_000) {
    throw new RangeError('Transition rate and horizon produce an unsupported projection range')
  }
  const uniformized = Q.map((row, i) => row.map((q, j) => (i === j ? 1 + q / lambda : q / lambda)))
  const pieceMean = totalMean / pieces
  const nTerms = Math.ceil(pieceMean + 12 * Math.sqrt(pieceMean) + 20)
  const result = zero()
  let power = identity()
  let weight = Math.exp(-pieceMean)
  let weightSum = 0
  for (let k = 0; k <= nTerms; k++) {
    weightSum += weight
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) result[i][j] += weight * power[i][j]
    }
    power = matmul(power, uniformized)
    weight = weight * pieceMean / (k + 1)
  }

  const step = result.map(row => row.map(value => value / weightSum))
  return matrixPower(step, pieces)
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

function matrixPower(matrix, exponent) {
  let result = identity()
  let base = matrix
  let power = exponent
  while (power > 0) {
    if (power % 2 === 1) result = matmul(result, base)
    power = Math.floor(power / 2)
    if (power > 0) base = matmul(base, base)
  }
  return result
}

export function validateProbabilityVector(values, tol = 1e-6) {
  if (!Array.isArray(values) || values.length !== N) {
    return [`Probability vector must contain ${N} state values`]
  }
  const numeric = values.map(Number)
  if (numeric.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    return ['Initial state probabilities must be finite values in [0,1]']
  }
  const sum = numeric.reduce((total, value) => total + value, 0)
  return Math.abs(sum - 1) > tol ? [`Initial state probabilities sum to ${sum}, expected 1`] : []
}

// State occupancy at time t given initial distribution pi0.
export function occupancy(pi0, P) {
  const piErrors = validateProbabilityVector(pi0)
  if (piErrors.length) throw new RangeError(piErrors[0])
  const pErrors = validateP(P)
  if (pErrors.length) throw new RangeError(pErrors[0])
  const pi = Array(N).fill(0)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pi[j] += Number(pi0[i]) * P[i][j]
  return pi
}

// Expected claims: transitions alone do NOT create claims. Claims arise only
// from verified milestones: entry/course/reengagement events per member-year,
// times benefit utilisation, claim acceptance and average benefit amount.
// milestoneRates: { entry, course, reengagement } per member-year.
// benefitAmount: KES per verified milestone (from approved schedule).
export function expectedClaims({ memberYears, milestoneRates, benefitAmount, acceptanceRate = 1, perEventCap = null, annualCap = null }) {
  const rates = ['entry', 'course', 'reengagement'].map(key => Number(milestoneRates?.[key] ?? 0))
  const numericMemberYears = Number(memberYears)
  const numericBenefitAmount = Number(benefitAmount)
  const numericAcceptance = Number(acceptanceRate)
  const numericPerEventCap = perEventCap == null ? null : Number(perEventCap)
  const numericAnnualCap = annualCap == null ? null : Number(annualCap)
  if (!Number.isFinite(numericMemberYears) || numericMemberYears < 0
      || !Number.isFinite(numericBenefitAmount) || numericBenefitAmount < 0
      || !Number.isFinite(numericAcceptance) || numericAcceptance < 0 || numericAcceptance > 1
      || rates.some(rate => !Number.isFinite(rate) || rate < 0)
      || (numericPerEventCap != null && (!Number.isFinite(numericPerEventCap) || numericPerEventCap < 0))
      || (numericAnnualCap != null && (!Number.isFinite(numericAnnualCap) || numericAnnualCap < 0))) {
    throw new RangeError('Claims assumptions must be finite and non-negative; acceptance must be in [0,1]')
  }
  const perMemberYear = rates.reduce((sum, rate) => sum + rate, 0)
  const perEventAmount = numericPerEventCap == null
    ? numericBenefitAmount
    : Math.min(numericBenefitAmount, numericPerEventCap)
  let expected = numericMemberYears * perMemberYear * perEventAmount * numericAcceptance
  if (numericAnnualCap != null) expected = Math.min(expected, numericMemberYears * numericAnnualCap)
  return expected
}

// Gross premium build-up. Components are explicit loadings — never summed
// twice. expenseRatio null → expense component reported as unavailable.
export function grossPremium({ expectedClaims, memberYears, expenseRatio = null, adminCostPerMemberYear = 0, acquisitionRatio = 0, riskMarginRatio = 0, contingencyRatio = 0, reinsuranceRatio = 0 }) {
  const values = {
    expectedClaims: Number(expectedClaims),
    memberYears: Number(memberYears),
    adminCostPerMemberYear: Number(adminCostPerMemberYear),
    acquisitionRatio: Number(acquisitionRatio),
    riskMarginRatio: Number(riskMarginRatio),
    contingencyRatio: Number(contingencyRatio),
    reinsuranceRatio: Number(reinsuranceRatio),
    expenseRatio: expenseRatio == null ? null : Number(expenseRatio),
  }
  if (Object.values(values).some(value => value !== null && (!Number.isFinite(value) || value < 0))
      || (values.expenseRatio != null && values.expenseRatio > 1)) {
    throw new RangeError('Premium assumptions must be finite and non-negative; expense ratio must be in [0,1]')
  }
  const claimsPerMY = values.memberYears > 0 ? values.expectedClaims / values.memberYears : 0
  const adminPerMY = values.adminCostPerMemberYear
  const acquisition = claimsPerMY * values.acquisitionRatio
  const riskMargin = claimsPerMY * values.riskMarginRatio
  const contingency = claimsPerMY * values.contingencyRatio
  const reinsurance = claimsPerMY * values.reinsuranceRatio
  const expense = values.expenseRatio == null ? null : claimsPerMY * values.expenseRatio
  const knownSubtotal = claimsPerMY + adminPerMY + acquisition + riskMargin + contingency + reinsurance
  const total = expense == null ? null : knownSubtotal + expense
  return {
    pure_premium_per_member_year: claimsPerMY,
    expense_loading_per_member_year: expense,
    admin_per_member_year: adminPerMY,
    acquisition_per_member_year: acquisition,
    risk_margin_per_member_year: riskMargin,
    contingency_per_member_year: contingency,
    reinsurance_per_member_year: reinsurance,
    known_subtotal_excluding_unavailable_expense_per_member_year: knownSubtotal,
    gross_premium_per_member_year: total,
    expense_ratio_available: expenseRatio != null,
    total_expected_claims: values.expectedClaims,
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
  if (!Array.isArray(counts) || counts.length !== N || counts.some(row => !Array.isArray(row) || row.length !== N)) {
    return [`counts must be a ${N}x${N} matrix`]
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const v = Number(counts[i]?.[j])
    if (!Number.isFinite(v) || v < 0) errors.push(`counts[${i}][${j}] must be a finite non-negative number`)
    if (i === j && v !== 0) errors.push(`counts[${i}][${j}] must be zero; self-transitions are not counted`)
    if (i !== j && v > 0 && !ALLOWED[STATES[i]]?.includes(STATES[j])) {
      errors.push(`Transition ${STATES[i]}→${STATES[j]} is not an allowed transition`)
    }
  }
  return errors
}
export function validateQ(Q) {
  const errors = []
  if (!Array.isArray(Q) || Q.length !== N || Q.some(row => !Array.isArray(row) || row.length !== N)) {
    return [`Q must be a ${N}x${N} matrix`]
  }
  for (let i = 0; i < N; i++) {
    let rowSum = 0
    for (let j = 0; j < N; j++) {
      const q = Q[i][j]
      if (!Number.isFinite(q)) { errors.push(`Q[${i}][${j}] must be finite`); continue }
      if (i !== j && q < 0) errors.push(`Q[${i}][${j}] negative off-diagonal`)
      if (i !== j && q > 0 && !ALLOWED[STATES[i]].includes(STATES[j])) {
        errors.push(`Q transition ${STATES[i]}→${STATES[j]} is not allowed`)
      }
      if (i === j && q > 0.000001) errors.push(`Q[${i}][${i}] positive diagonal`)
      rowSum += q
    }
    if (Math.abs(rowSum) > 1e-6) errors.push(`Q row ${i} sums to ${rowSum}, expected 0`)
  }
  return errors
}
export function validateP(P, tol = 1e-6) {
  const errors = []
  if (!Array.isArray(P) || P.length !== N || P.some(row => !Array.isArray(row) || row.length !== N)) {
    return [`P must be a ${N}x${N} matrix`]
  }
  for (let i = 0; i < N; i++) {
    let rowSum = 0
    for (let j = 0; j < N; j++) {
      const p = P[i][j]
      if (!Number.isFinite(p)) { errors.push(`P[${i}][${j}] must be finite`); continue }
      if (p < -tol || p > 1 + tol) errors.push(`P[${i}][${j}]=${p} outside [0,1]`)
      rowSum += p
    }
    if (Math.abs(rowSum - 1) > 1e-4) errors.push(`P row ${i} sums to ${rowSum}`)
  }
  return errors
}
