import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Insurer portal — Protection plan setup. Insurers manage their own
//  protection_plans rows (benefits/limits jsonb). No clinical data involved.

export default function InsurerPlans() {
  const { user } = useAuthProfile()
  const [insurer, setInsurer] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', code: '', sessions: '', maxClaim: '', telehealth: false })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data: ins } = await supabase.from('insurers').select('id, name').eq('profile_id', user.id).maybeSingle()
    if (!ins) { setError('No insurer organisation is linked to this account.'); setLoading(false); return }
    setInsurer(ins)
    const { data, error: qErr } = await supabase.from('protection_plans').select('*').eq('insurer_id', ins.id).order('created_at')
    if (qErr) setError('Could not load plans.')
    else setPlans(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void load() }, [load])

  const createPlan = async () => {
    if (!form.name.trim()) { toast.error('Plan name is required.'); return }
    setSaving(true)
    const { error: insErr } = await supabase.from('protection_plans').insert({
      insurer_id: insurer.id,
      name: form.name.trim(),
      code: form.code.trim() || null,
      benefits: { therapy_sessions: Number(form.sessions) || 0, telehealth: Boolean(form.telehealth) },
      limits: { max_claim_kes: Number(form.maxClaim) || 0 },
    })
    setSaving(false)
    if (insErr) { toast.error(insErr.message || 'Could not create plan.'); return }
    toast.success('Plan created.')
    setForm({ name: '', code: '', sessions: '', maxClaim: '', telehealth: false })
    await load()
  }

  const toggleActive = async (plan) => {
    const { error: upErr } = await supabase.from('protection_plans').update({ active: !plan.active }).eq('id', plan.id)
    if (upErr) { toast.error('Could not update plan.'); return }
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, active: !p.active } : p))
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Protection plans</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}

      <section className="portal-card">
        <h3>Plans ({plans.length})</h3>
        {plans.length === 0 && <p className="portal-notice">No plans yet — create one below.</p>}
        {plans.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>{p.name}{p.code ? ` · ${p.code}` : ''}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                {p.benefits?.therapy_sessions ?? 0} sessions/yr{p.benefits?.telehealth ? ' · telehealth' : ''}
                {p.limits?.max_claim_kes ? ` · max claim KES ${Number(p.limits.max_claim_kes).toLocaleString()}` : ''}
              </p>
            </div>
            <span style={{ color: p.active ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 600 }}>{p.active ? 'ACTIVE' : 'INACTIVE'}</span>
            <button type="button" className="btn-ghost fs-11" style={{ padding: '6px 10px', minHeight: '32px' }} onClick={() => toggleActive(p)}>
              {p.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </section>

      <section className="portal-card">
        <h3>New plan</h3>
        <div className="portal-form">
          <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} /></label>
          <label>Code (optional)<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} maxLength={40} /></label>
          <label>Therapy sessions per year<NumberField value={form.sessions} onChange={v => setForm({ ...form, sessions: v ?? '' })} min={0} max={60} /></label>
          <label>Max claim (KES)<NumberField value={form.maxClaim} onChange={v => setForm({ ...form, maxClaim: v ?? '' })} min={0} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={form.telehealth} onChange={e => setForm({ ...form, telehealth: e.target.checked })} /> Telehealth covered
          </label>
          <button type="button" className="btn-primary" onClick={createPlan} disabled={saving || !insurer}>
            {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Create plan'}
          </button>
        </div>
      </section>
    </section>
  )
}
