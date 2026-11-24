import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Super-admin actuarial workbench — four-state Markov model (S0–S3),
//  aggregate/synthetic data only. Decision-support tool, NOT an automated
//  insurance or clinical decision-maker. No member-level data is used.

const ZERO_COUNTS = Array.from({ length: 4 }, () => [0, 0, 0, 0])
const SCENARIOS = [
  { label: 'Base', multipliers: {} },
  { label: 'Lower utilisation', multipliers: { entry: 0.7, course: 0.7, reengagement: 0.7 } },
  { label: 'Higher utilisation', multipliers: { entry: 1.4, course: 1.4, reengagement: 1.4 } },
  { label: 'Adverse claims', multipliers: { entry: 1.2, course: 1.2, reengagement: 1.2 }, claimsAdj: 1.3, acceptanceRate: 0.95 },
]

export default function ActuarialWorkbench() {
  const [counts, setCounts] = useState(ZERO_COUNTS)
  const [exposure, setExposure] = useState([1000, 400, 300, 200]) // member-years per state
  const [horizon, setHorizon] = useState(1) // years
  const [pi0, setPi0] = useState([0.7, 0.2, 0.08, 0.02])
  const [rates, setRates] = useState({ entry: 0.25, course: 1.5, reengagement: 0.4 }) // per member-year
  const [benefitAmount, setBenefitAmount] = useState(5000)
  const [memberYears, setMemberYears] = useState(1000)
  const [acceptance, setAcceptance] = useState(0.9)
  const [perEventCap, setPerEventCap] = useState('')
  const [annualCap, setAnnualCap] = useState('')
  const [pricing, setPricing] = useState({ expenseRatio: '', adminCost: '', acquisition: 0.15, riskMargin: 0.1, contingency: 0.05, reinsurance: 0 })
  const [result, setResult] = useState(null)
  const [runs, setRuns] = useState([])
  const [saving, setSaving] = useState(false)
  const [datasetType, setDatasetType] = useState('synthetic_assumption')
  const [datasetSource, setDatasetSource] = useState('')

  const loadRuns = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_actuarial_runs')
    if (error) {
      toast.error(error.message || 'Could not load saved actuarial runs.')
      return
    }
    setRuns(data || [])
  }, [])
  useEffect(() => { void loadRuns() }, [loadRuns])

  const run = () => {
    if (datasetType === 'observed_aggregate' && !datasetSource.trim()) {
      toast.error('Enter the source of the observed aggregate data.')
      return
    }
    const countErr = validateCounts(counts)
    if (countErr.length) { toast.error(countErr[0]); return }
    const piErrors = validateProbabilityVector(pi0)
    if (piErrors.length) { toast.error(piErrors[0]); return }
    try {
      const { Q, meta } = estimateGenerator(counts, exposure)
      const qErr = validateQ(Q)
      if (qErr.length) { toast.error(qErr[0]); return }
      const P = matrixExp(Q, horizon)
      const pErr = validateP(P)
      if (pErr.length) { toast.error(`Projection check failed: ${pErr[0]}`); return }
      const occ = occupancy(pi0.map(Number), P)
      const modelBase = {
        memberYears: Number(memberYears),
        milestoneRates: rates,
        benefitAmount: Number(benefitAmount),
        acceptanceRate: Number(acceptance),
        perEventCap: perEventCap === '' ? null : Number(perEventCap),
        annualCap: annualCap === '' ? null : Number(annualCap),
      }
      const claims = expectedClaims(modelBase)
      const pricingAssumptions = {
        expenseRatio: pricing.expenseRatio === '' ? null : Number(pricing.expenseRatio),
        adminCostPerMemberYear: Number(pricing.adminCost),
        acquisitionRatio: Number(pricing.acquisition),
        riskMarginRatio: Number(pricing.riskMargin),
        contingencyRatio: Number(pricing.contingency),
        reinsuranceRatio: Number(pricing.reinsurance),
      }
      const prem = grossPremium({
        ...pricingAssumptions,
        expectedClaims: claims,
        memberYears: modelBase.memberYears,
      })
      const scenarios = runScenarios(modelBase, SCENARIOS, pricingAssumptions)
      setResult({
        Q, P, occ, claims, prem, scenarios, meta, horizon, datasetType, datasetSource,
        params: {
          counts, exposure, horizon, pi0, rates, benefitAmount,
          memberYears: modelBase.memberYears,
          acceptance: modelBase.acceptanceRate,
          perEventCap: modelBase.perEventCap,
          annualCap: modelBase.annualCap,
          pricing,
        },
      })
    } catch (error) {
      toast.error(error.message || 'Model inputs are invalid.')
    }
  }

  const save = async (scenarioLabel) => {
    if (!result) { toast.error('Run the model first.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('admin_save_actuarial_run', {
      p_model_version: 'ctmc-v1', p_scenario_label: scenarioLabel || 'custom',
      p_methodology: 'Continuous-time Markov (uniformization exp(Qt)); aggregate inputs; milestone-based claims; gross premium build-up. Illustrative decision support only; not actuarially validated.',
      p_params: result.params,
      p_dataset: {
        type: result.datasetType,
        source: result.datasetType === 'observed_aggregate' ? result.datasetSource.trim() : null,
        note: 'Aggregate transition counts and exposure — no member-level data; source is not independently verified.',
      },
      p_outputs: { Q: result.Q, P: result.P, occupancy: result.occ, expectedClaims: result.claims, premium: result.prem, scenarios: result.scenarios },
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Save failed.'); return }
    toast.success('Model run saved.')
    await loadRuns()
  }

  const fmt = (v, d = 4) => v == null ? 'n/a' : Number(v).toFixed(d)
  const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Super admin</p><h2>Actuarial workbench</h2></div>
      </header>
      <p className="portal-notice">
        Four-state continuous-time Markov model (S0–S3). Decision-support only — not clinically or
        regulatorily validated. Inputs are aggregate counts/exposure or labelled synthetic data;
        no member-level recovery data is used. Transition ≠ claim: claims arise only from verified
        treatment milestones. The claim frequency inputs are separate assumptions and are not
        derived from the transition matrix. Re-run after changing inputs; saved runs retain the
        parameters used for the displayed result.
      </p>
      <p className="portal-notice">
        Transition exposure and claims exposure are separate inputs: the projection horizon applies
        only to state occupancy, while covered member-years and the milestone-rate assumptions drive
        expected claims. Claims are not derived from state transitions or occupancy.
      </p>
      <label>Data basis
        <select value={datasetType} onChange={e => setDatasetType(e.target.value)}>
          <option value="synthetic_assumption">Synthetic / assumption-based (unvalidated)</option>
          <option value="observed_aggregate">Observed aggregate experience (source unverified)</option>
        </select>
      </label>
      {datasetType === 'observed_aggregate' && (
        <label>Aggregate data source<input value={datasetSource} maxLength={300} onChange={e => setDatasetSource(e.target.value)} /></label>
      )}

      <section className="portal-card">
        <h3>Model inputs</h3>
        <p className="portal-notice">Transition counts (rows = from-state, cols = to-state in order {STATES.join(', ')}). Only allowed transitions may be non-zero: {Object.entries(ALLOWED).map(([k, v]) => `${k}→{${v.join(',')}}`).join(' · ')}</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr><th></th>{STATES.map(s => <th key={s} style={{ padding: '4px 8px', color: 'var(--secondary)' }}>{s}</th>)}</tr></thead>
            <tbody>
              {counts.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', color: '#fff' }}>{STATES[i]}</td>
                  {row.map((c, j) => (
                    <td key={j} style={{ padding: '4px 4px' }}>
                      {i === j ? <span style={{ color: 'var(--text-muted)' }}>—</span> : (
                        <NumberField value={c} min={0} onChange={v => {
                          setCounts(current => current.map((r, ri) => r.map((value, ci) => ri === i && ci === j ? v ?? 0 : value)))
                        }} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="portal-form" style={{ marginTop: '12px' }}>
          <label>Exposure per state (member-years){exposure.map((e, i) => (
            <NumberField key={i} value={e} min={0} onChange={v => setExposure(current => current.map((value, index) => index === i ? v ?? 0 : value))} />
          ))}</label>
          <label>Projection horizon (years)<NumberField value={horizon} min={0.1} max={20} onChange={v => setHorizon(v ?? 1)} /></label>
          <label>Initial distribution π₀ (S0–S3){pi0.map((p, i) => (
            <NumberField key={i} value={p} min={0} max={1} step={0.01} onChange={v => setPi0(current => current.map((value, index) => index === i ? v ?? 0 : value))} />
          ))}</label>
          <label>Milestone rates /member-year — entry, course, re-engagement
            <div style={{ display: 'flex', gap: '8px' }}>
              {['entry', 'course', 'reengagement'].map(k => (
                <NumberField key={k} value={rates[k]} min={0} onChange={v => setRates({ ...rates, [k]: v ?? 0 })} />
              ))}
            </div>
          </label>
          <label>Benefit amount per milestone (KES)<NumberField value={benefitAmount} min={0} onChange={v => setBenefitAmount(v ?? 0)} /></label>
          <label>Total covered member-years for claims estimate<NumberField value={memberYears} min={0} onChange={v => setMemberYears(v ?? 0)} /></label>
          <label>Claim acceptance rate<NumberField value={acceptance} min={0} max={1} step={0.01} onChange={v => setAcceptance(v ?? 1)} /></label>
          <label>Per-event cap (KES, optional)<NumberField value={perEventCap} min={0} onChange={v => setPerEventCap(v ?? '')} /></label>
          <label>Annual aggregate cap (KES, optional)<NumberField value={annualCap} min={0} onChange={v => setAnnualCap(v ?? '')} /></label>
          <button type="button" className="btn-primary" onClick={run}>Run model</button>
        </div>
      </section>

      {result && (
        <>
          <section className="portal-card">
            <h3>Results — {result.horizon}y horizon</h3>
            <div className="portal-stats">
              <article className="portal-card"><span>Expected claims (KES)</span><strong>{Math.round(result.claims).toLocaleString()}</strong></article>
              <article className="portal-card"><span>{result.prem.expense_ratio_available ? 'Gross premium' : 'Known subtotal (expense unavailable)'} /member-year</span><strong>{result.prem.gross_premium_per_member_year == null ? 'n/a' : `KES ${fmt(result.prem.gross_premium_per_member_year, 2)}`}</strong></article>
              <article className="portal-card"><span>Pure premium /member-year</span><strong>KES {fmt(result.prem.pure_premium_per_member_year, 2)}</strong></article>
              <article className="portal-card"><span>Expense data</span><strong>{result.prem.expense_ratio_available ? 'loaded' : 'unavailable'}</strong></article>
            </div>
            <h4 style={{ color: '#fff', fontSize: '13px' }}>State occupancy at horizon</h4>
            {result.occ.map((p, i) => (
              <p key={i} className="fs-13" style={{ color: 'rgba(255,255,255,0.75)', margin: '4px 0' }}>
                {STATE_LABELS[STATES[i]]}: <strong>{pct(p)}</strong>
              </p>
            ))}
            <h4 style={{ color: '#fff', fontSize: '13px', marginTop: '12px' }}>Transition intensities (Q, per year)</h4>
            <pre className="portal-json" style={{ fontSize: '11px' }}>{JSON.stringify(result.Q.map(r => r.map(v => +v.toFixed(4))), null, 1)}</pre>
            <p className="portal-notice">
              Data basis: {result.datasetType === 'synthetic_assumption' ? 'synthetic / assumption-based' : `observed aggregate, source: ${result.datasetSource}`}.
              Source not independently verified. Assumptions: time-homogeneous Markov and allowed transitions only; model is not validated.
            </p>
          </section>

          <section className="portal-card">
            <h3>Deterministic sensitivity scenarios</h3>
            <p className="portal-notice">
              These fixed stress cases change manually entered assumptions relative to the base case;
              they are not probability-weighted forecasts, confidence intervals or stochastic simulations.
              They do not model correlations between assumptions or uncertainty in transition rates.
              Premium output uses the same pricing loadings as the base case.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '680px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Scenario</th>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Utilisation multipliers (entry / course / re-entry)</th>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Benefit multiplier</th>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Acceptance</th>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Expected claims (KES)</th>
                    <th style={{ padding: '4px 8px', color: 'var(--secondary)' }}>Gross premium (KES/member-year)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map(s => (
                    <tr key={s.label}>
                      <td style={{ padding: '4px 8px', color: '#fff' }}>{s.label}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.75)' }}>
                        {['entry', 'course', 'reengagement'].map(key => s.assumptions.utilisationMultipliers[key]).join(' / ')}
                      </td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.75)' }}>{s.assumptions.benefitMultiplier}×</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.75)' }}>{pct(s.assumptions.acceptanceRate)}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.75)' }}>{Math.round(s.expectedClaims).toLocaleString()}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.75)' }}>
                        {s.premium.gross_premium_per_member_year == null
                          ? 'Unavailable (expense ratio missing)'
                          : fmt(s.premium.gross_premium_per_member_year, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="portal-card">
            <h3>Pricing build-up</h3>
            <div className="portal-form">
              <label>Expense loading on pure claims cost (blank = unavailable)<NumberField value={pricing.expenseRatio} min={0} max={1} step={0.01} onChange={v => setPricing({ ...pricing, expenseRatio: v ?? '' })} /></label>
              <label>Admin cost /member-year (KES)<NumberField value={pricing.adminCost} min={0} onChange={v => setPricing({ ...pricing, adminCost: v ?? '' })} /></label>
              <label>Acquisition loading ratio<NumberField value={pricing.acquisition} min={0} step={0.01} onChange={v => setPricing({ ...pricing, acquisition: v ?? 0 })} /></label>
              <label>Risk margin ratio<NumberField value={pricing.riskMargin} min={0} step={0.01} onChange={v => setPricing({ ...pricing, riskMargin: v ?? 0 })} /></label>
              <label>Contingency ratio<NumberField value={pricing.contingency} min={0} step={0.01} onChange={v => setPricing({ ...pricing, contingency: v ?? 0 })} /></label>
              <label>Reinsurance ratio<NumberField value={pricing.reinsurance} min={0} step={0.01} onChange={v => setPricing({ ...pricing, reinsurance: v ?? 0 })} /></label>
              <button type="button" className="btn-primary" onClick={run}>Re-run with pricing</button>
            </div>
            <pre className="portal-json" style={{ fontSize: '11px' }}>{JSON.stringify(result.prem, null, 1)}</pre>
            <p className="portal-notice">Illustrative only — not a market premium or actuarially validated. If expense data is unavailable, the known subtotal excludes it and gross premium is not reported. Each ratio loading is applied to pure claims cost and may overlap with other components. LossLens technology costs are separate from insurer risk costs.</p>
          </section>

          <section className="portal-card">
            <h3>Saved runs</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button type="button" className="btn-primary fs-12" disabled={saving} onClick={() => save('base')}>{saving ? 'Saving…' : 'Save current run'}</button>
            </div>
            {runs.length === 0 && <p className="portal-notice">No saved runs yet.</p>}
            {runs.map(r => (
              <p key={r.id} className="fs-12" style={{ color: 'var(--text-muted)', margin: '4px 0' }}>
                {r.model_version} · {r.scenario_label || 'custom'} · {r.dataset?.type || 'data basis unavailable'} · {new Date(r.created_at).toLocaleString()}
              </p>
            ))}
          </section>
        </>
      )}
    </section>
  )
}

//  LossLens Protection V2 — four-state Markov modelling (pure JS, no deps).
//  States: S0 no identified harmful gambling, S1 harmful gambling not in
//  treatment, S2 in treatment, S3 post-treatment recovery.
//  Modelling states only — never clinical diagnoses, never assigned to real
//  users from behavioural data. All inputs are aggregate counts/exposure.

const STATES = ['S0', 'S1', 'S2', 'S3']
const STATE_LABELS = {
  S0: 'No identified harmful gambling',
  S1: 'Harmful gambling, not in treatment',
  S2: 'In treatment',
  S3: 'Post-treatment recovery',
}
// Allowed transitions (both directions incl. relapse/re-entry).
const ALLOWED = {
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
function estimateGenerator(counts, exposure) {
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
function matrixExp(Q, t) {
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

function validateProbabilityVector(values, tol = 1e-6) {
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
function occupancy(pi0, P) {
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
function expectedClaims({ memberYears, milestoneRates, benefitAmount, acceptanceRate = 1, perEventCap = null, annualCap = null }) {
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
function grossPremium({ expectedClaims, memberYears, expenseRatio = null, adminCostPerMemberYear = 0, acquisitionRatio = 0, riskMarginRatio = 0, contingencyRatio = 0, reinsuranceRatio = 0 }) {
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

// Scenario runner: applies deterministic assumption changes to milestone rates.
function runScenarios(base, variants, pricing = null) {
  // variants: [{ label, multipliers: { entry, course, reengagement }, claimsAdj?, acceptanceRate? }]
  return variants.map(v => {
    const multipliers = {
      entry: v.multipliers?.entry ?? 1,
      course: v.multipliers?.course ?? 1,
      reengagement: v.multipliers?.reengagement ?? 1,
    }
    const rates = {
      entry: (base.milestoneRates.entry || 0) * multipliers.entry,
      course: (base.milestoneRates.course || 0) * multipliers.course,
      reengagement: (base.milestoneRates.reengagement || 0) * multipliers.reengagement,
    }
    const benefitMultiplier = v.claimsAdj ?? 1
    const acceptanceRate = v.acceptanceRate ?? base.acceptanceRate ?? 1
    const claims = expectedClaims({
      memberYears: base.memberYears, milestoneRates: rates,
      benefitAmount: base.benefitAmount * benefitMultiplier,
      acceptanceRate,
      perEventCap: base.perEventCap, annualCap: base.annualCap,
    })
    const scenario = {
      label: v.label,
      assumptions: { utilisationMultipliers: multipliers, benefitMultiplier, acceptanceRate },
      milestoneRates: rates,
      expectedClaims: claims,
    }
    if (pricing) {
      scenario.premium = grossPremium({
        ...pricing,
        expectedClaims: claims,
        memberYears: base.memberYears,
      })
    }
    return scenario
  })
}

// Validation helpers for UI + tests.
function validateCounts(counts) {
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
function validateQ(Q) {
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
      if (i === j && q > 0) errors.push(`Q[${i}][${i}] positive diagonal`)
      rowSum += q
    }
    if (Math.abs(rowSum) > 1e-6) errors.push(`Q row ${i} sums to ${rowSum}, expected 0`)
  }
  return errors
}
function validateP(P, tol = 1e-6) {
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
