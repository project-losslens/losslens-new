import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Insurer portal — Protection products. Plans are the stable product
//  shell; terms live in immutable protection_plan_versions (draft ->
//  super-admin approval -> approved). Benefits are typed rows bound to a
//  draft version. Active policies always reference the version they were
//  issued under — later versions never rewrite them.

const STRUCTURES = [
  { value: 'fixed_sum', label: 'Fixed-sum' },
  { value: 'treatment_reimbursement', label: 'Treatment-cost' },
  { value: 'hybrid', label: 'Hybrid (legally approved arrangement only)' },
]
const BENEFIT_TYPES = [
  { value: 'fixed_sum', label: 'Fixed sum' },
  { value: 'treatment_reimbursement', label: 'Treatment reimbursement' },
  { value: 'provider_direct_payment', label: 'Provider direct payment' },
]

export default function InsurerPlans() {
  const { user } = useAuthProfile()
  const [insurer, setInsurer] = useState(null)
  const [plans, setPlans] = useState([])
  const [versions, setVersions] = useState([])
  const [benefits, setBenefits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', code: '' })
  const [versionForm, setVersionForm] = useState({ plan_id: '', benefit_structure: 'fixed_sum', premium_amount: '', premium_frequency: 'monthly', policy_term_months: '12', waiting_period_days: '0', grace_period_days: '30', aggregate_limit_kes: '' })
  const [benefitForm, setBenefitForm] = useState({ plan_version_id: '', benefit_code: '', name: '', benefit_type: 'fixed_sum', fixed_amount: '', per_event_limit: '', per_policy_limit: '', annual_limit: '', waiting_period_days: '0', frequency_limit: '', evidence_requirements: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data: ins } = await supabase.from('insurers').select('id, name').eq('profile_id', user.id).maybeSingle()
    if (!ins) { setError('No insurer organisation is linked to this account.'); setLoading(false); return }
    setInsurer(ins)
    const [pls, vers, bens] = await Promise.all([
      supabase.from('protection_plans').select('*').eq('insurer_id', ins.id).order('created_at'),
      supabase.from('protection_plan_versions').select('*').eq('insurer_id', ins.id).order('created_at', { ascending: false }),
      supabase.from('protection_benefits').select('*').order('created_at'),
    ])
    if (pls.error || vers.error) setError('Could not load products.')
    else { setPlans(pls.data || []); setVersions(vers.data || []); setBenefits(bens.data || []) }
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void load() }, [load])

  const versionBenefits = (vid) => benefits.filter(b => b.plan_version_id === vid)

  const createPlan = async () => {
    if (!form.name.trim()) { toast.error('Product name is required.'); return }
    setSaving(true)
    const { error: insErr } = await supabase.from('protection_plans').insert({
      insurer_id: insurer.id, name: form.name.trim(), code: form.code.trim() || null,
    })
    setSaving(false)
    if (insErr) { toast.error(insErr.message || 'Could not create product.'); return }
    toast.success('Product created. Now create a version with its terms.')
    setForm({ name: '', code: '' })
    await load()
  }

  const toggleActive = async (plan) => {
    const { error: upErr } = await supabase.from('protection_plans').update({ active: !plan.active }).eq('id', plan.id)
    if (upErr) { toast.error('Could not update product.'); return }
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, active: !p.active } : p))
  }

  const createVersion = async () => {
    if (!versionForm.plan_id) { toast.error('Select a product.'); return }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('insurer_create_plan_version', {
      p_plan_id: versionForm.plan_id,
      p_benefit_structure: versionForm.benefit_structure,
      p_terms: {
        policy_term_months: Number(versionForm.policy_term_months) || 12,
        waiting_period_days: Number(versionForm.waiting_period_days) || 0,
        grace_period_days: Number(versionForm.grace_period_days) || 30,
        aggregate_limit_kes: Number(versionForm.aggregate_limit_kes) || null,
      },
      p_premium_amount: versionForm.premium_amount === '' ? null : Number(versionForm.premium_amount),
      p_premium_frequency: versionForm.premium_frequency,
    })
    setSaving(false)
    if (rpcError) { toast.error(rpcError.message || 'Could not create version.'); return }
    toast.success('Draft version created — add benefits, then it awaits approval.')
    setVersionForm({ ...versionForm, plan_id: '' })
    await load()
  }

  const addBenefit = async () => {
    if (!benefitForm.plan_version_id || !benefitForm.benefit_code.trim() || !benefitForm.name.trim()) {
      toast.error('Version, benefit code and name are required.'); return
    }
    setSaving(true)
    const evidence = benefitForm.evidence_requirements.trim()
      ? benefitForm.evidence_requirements.split(';').map(s => s.trim()).filter(Boolean)
      : []
    const { error: rpcError } = await supabase.rpc('insurer_upsert_benefit', {
      p_plan_version_id: benefitForm.plan_version_id,
      p_benefit_code: benefitForm.benefit_code.trim(),
      p_name: benefitForm.name.trim(),
      p_benefit_type: benefitForm.benefit_type,
      p_fixed_amount: benefitForm.fixed_amount === '' ? null : Number(benefitForm.fixed_amount),
      p_per_event_limit: benefitForm.per_event_limit === '' ? null : Number(benefitForm.per_event_limit),
      p_per_policy_limit: benefitForm.per_policy_limit === '' ? null : Number(benefitForm.per_policy_limit),
      p_annual_limit: benefitForm.annual_limit === '' ? null : Number(benefitForm.annual_limit),
      p_waiting_period_days: Number(benefitForm.waiting_period_days) || 0,
      p_frequency_limit: benefitForm.frequency_limit === '' ? null : Number(benefitForm.frequency_limit),
      p_evidence_requirements: evidence,
    })
    setSaving(false)
    if (rpcError) { toast.error(rpcError.message || 'Could not save benefit.'); return }
    toast.success('Benefit saved.')
    setBenefitForm({ ...benefitForm, benefit_code: '', name: '', fixed_amount: '', per_event_limit: '', per_policy_limit: '', annual_limit: '', frequency_limit: '' })
    await load()
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Protection products</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}
      <p className="portal-notice">Product terms are versioned. Once a version is approved by LossLens it cannot be edited — create a new version instead. Only approved versions can be issued on policies.</p>

      <section className="portal-card">
        <h3>Products ({plans.length})</h3>
        {plans.length === 0 && <p className="portal-notice">No products yet — create one below.</p>}
        {plans.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>{p.name}{p.code ? ` · ${p.code}` : ''}</p>
            </div>
            <span style={{ color: p.active ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 600 }}>{p.active ? 'ACTIVE' : 'INACTIVE'}</span>
            <button type="button" className="btn-ghost fs-11" style={{ padding: '6px 10px', minHeight: '32px' }} onClick={() => toggleActive(p)}>
              {p.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </section>

      <section className="portal-card">
        <h3>Versions ({versions.length})</h3>
        {versions.length === 0 && <p className="portal-notice">No versions yet.</p>}
        {versions.map(v => (
          <div key={v.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>
                  {plans.find(p => p.id === v.plan_id)?.name || 'Product'} · v{v.version_no}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                  {v.benefit_structure.replace(/_/g, ' ')} · KES {Number(v.premium_amount || 0).toLocaleString()}/{v.premium_frequency}
                  {v.terms?.policy_term_months ? ` · ${v.terms.policy_term_months}mo term` : ''}
                  {v.terms?.waiting_period_days ? ` · ${v.terms.waiting_period_days}d wait` : ''}
                </p>
              </div>
              <span style={{ color: v.status === 'approved' ? '#2DD4BF' : v.status === 'draft' ? '#F2C879' : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{v.status.replace(/_/g, ' ')}</span>
            </div>
            {versionBenefits(v.id).length > 0 && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', margin: '6px 0 0' }}>
                {versionBenefits(v.id).map(b => `${b.benefit_code}: ${b.benefit_type.replace(/_/g, ' ')}`).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="portal-card">
        <h3>New version</h3>
        <div className="portal-form">
          <label>Product
            <select value={versionForm.plan_id} onChange={e => setVersionForm({ ...versionForm, plan_id: e.target.value })}>
              <option value="">Select…</option>
              {plans.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Benefit structure
            <select value={versionForm.benefit_structure} onChange={e => setVersionForm({ ...versionForm, benefit_structure: e.target.value })}>
              {STRUCTURES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Premium per period (KES)<NumberField value={versionForm.premium_amount} onChange={v => setVersionForm({ ...versionForm, premium_amount: v ?? '' })} min={0} /></label>
          <label>Premium frequency
            <select value={versionForm.premium_frequency} onChange={e => setVersionForm({ ...versionForm, premium_frequency: e.target.value })}>
              <option value="single">Single</option><option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option><option value="annual">Annual</option>
            </select>
          </label>
          <label>Policy term (months)<NumberField value={versionForm.policy_term_months} onChange={v => setVersionForm({ ...versionForm, policy_term_months: v ?? '' })} min={1} max={60} /></label>
          <label>Waiting period (days)<NumberField value={versionForm.waiting_period_days} onChange={v => setVersionForm({ ...versionForm, waiting_period_days: v ?? '' })} min={0} /></label>
          <label>Grace period (days)<NumberField value={versionForm.grace_period_days} onChange={v => setVersionForm({ ...versionForm, grace_period_days: v ?? '' })} min={0} /></label>
          <label>Aggregate limit (KES, optional)<NumberField value={versionForm.aggregate_limit_kes} onChange={v => setVersionForm({ ...versionForm, aggregate_limit_kes: v ?? '' })} min={0} /></label>
          <button type="button" className="btn-primary" onClick={createVersion} disabled={saving || !insurer}>
            {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Create draft version'}
          </button>
        </div>
      </section>

      <section className="portal-card">
        <h3>Add benefit (draft versions only)</h3>
        <div className="portal-form">
          <label>Product version
            <select value={benefitForm.plan_version_id} onChange={e => setBenefitForm({ ...benefitForm, plan_version_id: e.target.value })}>
              <option value="">Select draft…</option>
              {versions.filter(v => v.status === 'draft').map(v => <option key={v.id} value={v.id}>v{v.version_no} · {plans.find(p => p.id === v.plan_id)?.name}</option>)}
            </select>
          </label>
          <label>Benefit code<input value={benefitForm.benefit_code} onChange={e => setBenefitForm({ ...benefitForm, benefit_code: e.target.value })} maxLength={40} placeholder="e.g. RELAPSE_SUPPORT" /></label>
          <label>Name<input value={benefitForm.name} onChange={e => setBenefitForm({ ...benefitForm, name: e.target.value })} maxLength={120} /></label>
          <label>Benefit type
            <select value={benefitForm.benefit_type} onChange={e => setBenefitForm({ ...benefitForm, benefit_type: e.target.value })}>
              {BENEFIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {benefitForm.benefit_type === 'fixed_sum' && (
            <label>Fixed amount (KES)<NumberField value={benefitForm.fixed_amount} onChange={v => setBenefitForm({ ...benefitForm, fixed_amount: v ?? '' })} min={0} /></label>
          )}
          <label>Per-event limit (KES)<NumberField value={benefitForm.per_event_limit} onChange={v => setBenefitForm({ ...benefitForm, per_event_limit: v ?? '' })} min={0} /></label>
          <label>Per-policy limit (KES, optional)<NumberField value={benefitForm.per_policy_limit} onChange={v => setBenefitForm({ ...benefitForm, per_policy_limit: v ?? '' })} min={0} /></label>
          <label>Annual limit (KES, optional)<NumberField value={benefitForm.annual_limit} onChange={v => setBenefitForm({ ...benefitForm, annual_limit: v ?? '' })} min={0} /></label>
          <label>Benefit waiting period (days)<NumberField value={benefitForm.waiting_period_days} onChange={v => setBenefitForm({ ...benefitForm, waiting_period_days: v ?? '' })} min={0} /></label>
          <label>Frequency limit per year (optional)<NumberField value={benefitForm.frequency_limit} onChange={v => setBenefitForm({ ...benefitForm, frequency_limit: v ?? '' })} min={0} /></label>
          <label>Evidence requirements (semicolon-separated)<input value={benefitForm.evidence_requirements} onChange={e => setBenefitForm({ ...benefitForm, evidence_requirements: e.target.value })} placeholder="service confirmation; provider attestation" /></label>
          <button type="button" className="btn-primary" onClick={addBenefit} disabled={saving || !insurer}>
            {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Save benefit'}
          </button>
        </div>
      </section>
      <p className="portal-notice">Benefit structure, premium and limits must match the approved product filing. Hybrid arrangements require separate legal approval before use.</p>
    </section>
  )
}
