import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'
import {
  STATES, STATE_LABELS, ALLOWED, estimateGenerator, matrixExp, occupancy,
  expectedClaims, grossPremium, runScenarios, validateCounts, validateProbabilityVector, validateQ, validateP,
} from '../../lib/markov'

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
            <thead><tr><th></th>{STATES.map(s => <th key={s} style={{ padding: '4px 8px', color: '#7DBDEE' }}>{s}</th>)}</tr></thead>
            <tbody>
              {counts.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', color: '#fff' }}>{STATES[i]}</td>
                  {row.map((c, j) => (
                    <td key={j} style={{ padding: '4px 4px' }}>
                      {i === j ? <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span> : (
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
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Scenario</th>
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Utilisation multipliers (entry / course / re-entry)</th>
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Benefit multiplier</th>
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Acceptance</th>
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Expected claims (KES)</th>
                    <th style={{ padding: '4px 8px', color: '#7DBDEE' }}>Gross premium (KES/member-year)</th>
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
              <p key={r.id} className="fs-12" style={{ color: 'rgba(255,255,255,0.6)', margin: '4px 0' }}>
                {r.model_version} · {r.scenario_label || 'custom'} · {r.dataset?.type || 'data basis unavailable'} · {new Date(r.created_at).toLocaleString()}
              </p>
            ))}
          </section>
        </>
      )}
    </section>
  )
}
