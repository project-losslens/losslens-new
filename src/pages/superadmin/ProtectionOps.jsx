import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import AppIcon from '../../components/AppIcon'
import { PROTECTION_MODES } from '../../lib/protectionStates'
import NumberField from '../../components/NumberField'

//  Super-admin Protection Ops: pipeline counts, partner list, therapist
//  verification queue, protection_mode switch (confirmed + audited).

const STATUS_COLOR = {
  pending_verification: '#F2C879', active: '#2DD4BF', suspended: '#7DBDEE',
  ended: 'rgba(255,255,255,0.4)', rejected: '#ff9b9b',
}

export default function ProtectionOps() {
  const { user } = useAuthProfile()
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('concept')
  const [counts, setCounts] = useState({})
  const [pending, setPending] = useState([])
  const [partners, setPartners] = useState([])
  const [therapists, setTherapists] = useState([])
  const [saving, setSaving] = useState(false)
  const [partnerForm, setPartnerForm] = useState({ insurer_id: '', cohort_name: '', per_member_fee: '', contract_start: '' })
  const [insurers, setInsurers] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    const [{ data: setting }, { data: mems }, { data: parts }, { data: ths }, { data: ins }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'protection_mode').maybeSingle(),
      supabase.from('protection_memberships').select('status'),
      supabase.from('insurer_partnerships').select('id, cohort_name, status, per_member_fee, member_count').order('created_at', { ascending: false }).limit(20),
      supabase.from('therapists').select('id, specialty, status, license_number').eq('status', 'pending').limit(20),
      supabase.from('insurers').select('id, name').eq('status', 'active').order('name'),
    ])
    const v = setting?.value
    setMode(typeof v === 'string' ? v.replace(/"/g, '') : (v?.mode || 'concept'))
    const c = {}
    for (const m of mems || []) c[m.status] = (c[m.status] || 0) + 1
    setCounts(c)
    setPending((mems || []).filter(m => m.status === 'pending_verification').slice(0, 20))
    setPartners(parts || [])
    setTherapists(ths || [])
    setInsurers(ins || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void load() }, [load])

  const changeMode = async (next) => {
    if (next === mode) return
    if (!confirm(`Switch protection_mode from "${mode}" to "${next}"? This changes what users see.`)) return
    setSaving(true)
    const { error } = await supabase.from('system_settings').upsert(
      { key: 'protection_mode', value: next, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: 'key' }
    )
    if (error) { toast.error('Could not update protection mode.'); setSaving(false); return }
    // Audit (best-effort; requires recent auth)
    try { await supabase.rpc('log_admin_action', { p_action: 'protection_mode_change', p_metadata: { from: mode, to: next } }) } catch { /* non-fatal */ }
    setMode(next)
    toast.success(`Protection mode set to ${next}.`)
    setSaving(false)
  }

  const createPartner = async () => {
    if (!partnerForm.insurer_id || !partnerForm.cohort_name.trim()) { toast.error('Insurer and cohort name are required.'); return }
    setSaving(true)
    const { error } = await supabase.from('insurer_partnerships').insert({
      insurer_id: partnerForm.insurer_id,
      cohort_name: partnerForm.cohort_name.trim(),
      per_member_fee: Number(partnerForm.per_member_fee) || 0,
      contract_start: partnerForm.contract_start || null,
      status: 'active',
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not create partnership.'); return }
    toast.success('Partnership created.')
    setPartnerForm({ insurer_id: '', cohort_name: '', per_member_fee: '', contract_start: '' })
    await load()
  }

  const inviteTherapist = async (event) => {
    event.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: { action: 'invite', email: inviteEmail.trim(), role: 'therapist' },
      })
      if (error || data?.error) {
        console.error('Therapist invitation failed:', error || data?.error)
        toast.error('Could not send the therapist invite.')
      } else {
        toast.success('Therapist invite sent.')
        setInviteEmail('')
      }
    } catch (inviteError) {
      console.error('Therapist invitation request failed:', inviteError)
      toast.error('Could not send the therapist invite.')
    }
    setInviting(false)
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Super admin</p><h2>Protection ops</h2></div>
      </header>

      <section className="portal-card">
        <h3>Protection mode</h3>
        <p className="portal-notice">concept = hidden teaser only · pilot/live = member enrolment + portals active. Pilot/live copy is pending legal review.</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PROTECTION_MODES.map(m => (
            <button key={m} type="button" disabled={saving}
              onClick={() => changeMode(m)}
              style={{
                padding: '8px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${mode === m ? '#2DD4BF' : 'rgba(255,255,255,0.2)'}`,
                background: mode === m ? 'rgba(45,212,191,0.15)' : 'transparent',
                color: mode === m ? '#2DD4BF' : 'rgba(255,255,255,0.6)',
              }}>
              {m}
            </button>
          ))}
        </div>
        <p className="portal-notice" style={{ marginTop: '8px' }}>Current: <strong>{mode}</strong></p>
      </section>

      <section className="portal-card">
        <h3>Membership pipeline</h3>
        <div className="portal-stats">
          {['pending_verification', 'active', 'suspended', 'ended', 'rejected'].map(s => (
            <article key={s} className="portal-card">
              <span>{s.replace(/_/g, ' ')}</span>
              <strong style={{ color: STATUS_COLOR[s] }}>{counts[s] || 0}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="portal-card">
        <h3>Pending verification queue ({pending.length})</h3>
        {pending.length === 0 && <p className="portal-notice">Nothing pending.</p>}
        {pending.map(m => (
          <p key={m.id} className="fs-13" style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Membership {m.id.slice(0, 8)}… · ref {m.member_reference || '—'} · {new Date(m.created_at).toLocaleDateString()}
          </p>
        ))}
      </section>

      <section className="portal-card">
        <h3>Invite a therapist</h3>
        <form className="portal-form" onSubmit={inviteTherapist}>
          <label>Email<input type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required maxLength={254} /></label>
          <button className="btn-primary" disabled={inviting}>{inviting ? 'Sending...' : 'Send therapist invite'}</button>
        </form>
      </section>

      <section className="portal-card">
        <h3>Therapist verification queue ({therapists.length})</h3>
        {therapists.length === 0 && <p className="portal-notice">No therapists awaiting verification.</p>}
        {therapists.map(t => (
          <p key={t.id} className="fs-13" style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {t.specialty || 'Therapist'} · licence {t.license_number || '—'}
          </p>
        ))}
      </section>

      <section className="portal-card">
        <h3>Partner onboarding</h3>
        <div className="portal-form">
          <label>Insurer
            <select value={partnerForm.insurer_id} onChange={e => setPartnerForm({ ...partnerForm, insurer_id: e.target.value })}>
              <option value="">Select insurer…</option>
              {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label>Cohort name<input value={partnerForm.cohort_name} onChange={e => setPartnerForm({ ...partnerForm, cohort_name: e.target.value })} maxLength={120} /></label>
          <label>Per-member fee (KES)<NumberField value={partnerForm.per_member_fee} onChange={v => setPartnerForm({ ...partnerForm, per_member_fee: v ?? '' })} min={0} /></label>
          <label>Contract start<input type="date" value={partnerForm.contract_start} onChange={e => setPartnerForm({ ...partnerForm, contract_start: e.target.value })} /></label>
          <button type="button" className="btn-primary" onClick={createPartner} disabled={saving}>
            {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Create partnership'}
          </button>
        </div>
      </section>

      <section className="portal-card">
        <h3>Partners ({partners.length})</h3>
        {partners.length === 0 && <p className="portal-notice">No partnerships yet.</p>}
        {partners.map(p => (
          <p key={p.id} className="fs-13" style={{ color: 'rgba(255,255,255,0.7)', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {p.cohort_name} · {p.status} · {p.member_count} members · KES {Number(p.per_member_fee || 0).toLocaleString()}/member
          </p>
        ))}
      </section>
    </section>
  )
}
