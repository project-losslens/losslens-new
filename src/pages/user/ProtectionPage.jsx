import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getProtectionMode, protectionModeAllows } from '../../lib/protectionMode'
import NumberField from '../../components/NumberField'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import AppIcon from '../../components/AppIcon'

//  Member-facing LossLens Protection. Mode-gated; all data via whitelisted
//  RPCs. Copy pending legal review for pilot/live.

const CONSENT_LABELS = {
  status_updates: 'Share my membership status with my insurer',
  session_summaries: 'Share session summaries (no clinical detail)',
  billing_contact: 'Share billing contact details',
}
const CLAIM_STATUS_COLOR = {
  submitted: '#F2C879', under_review: '#7DBDEE', info_requested: '#7DBDEE',
  approved: '#2DD4BF', partially_approved: '#2DD4BF', paid: '#2DD4BF',
  rejected: '#ff9b9b', disputed: '#ff9b9b', cancelled: 'rgba(255,255,255,0.4)',
}
const POLICY_STATUS_COLOR = {
  issued: '#F2C879', pending_payment: '#F2C879', active: '#2DD4BF',
  grace: '#7DBDEE', lapsed: '#ff9b9b', cancelled: 'rgba(255,255,255,0.4)', expired: 'rgba(255,255,255,0.4)',
}

export default function ProtectionPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [insurers, setInsurers] = useState([])
  const [data, setData] = useState({ memberships: [], consents: [], events: [] })
  const [cover, setCover] = useState({ policies: [], benefits: [] })
  const [claims, setClaims] = useState([])
  const [therapists, setTherapists] = useState([])
  const [insurerId, setInsurerId] = useState('')
  const [memberRef, setMemberRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [preauthSessions, setPreauthSessions] = useState(1)
  const [preauthSent, setPreauthSent] = useState(false)
  const [claimForm, setClaimForm] = useState({ policy_id: '', benefit_code: '', claim_type: 'fixed_sum', event_description: '', event_date: '' })

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/login'); return }
    const [prot, cov, cls, ths, ins] = await Promise.all([
      supabase.rpc('member_list_my_protection'),
      supabase.rpc('member_list_my_cover'),
      supabase.rpc('member_list_my_claims'),
      supabase.rpc('member_list_therapists'),
      supabase.from('insurers').select('id, name').eq('status', 'active'),
    ])
    setData(prot.data || { memberships: [], consents: [], events: [] })
    setCover(cov.data || { policies: [], benefits: [] })
    setClaims(Array.isArray(cls.data) ? cls.data : (cls.data || []))
    setTherapists(ths.data || [])
    setInsurers(ins.data || [])
  }, [navigate])

  useEffect(() => {
    ;(async () => {
      const m = await getProtectionMode()
      setMode(m)
      if (!protectionModeAllows(m)) { setLoading(false); return }
      await load()
      setLoading(false)
    })()
  }, [load])

  const membership = data.memberships?.[0] || null
  const consents = (data.consents || []).filter(c => c.membership_id === membership?.id)
  const events = data.events || []
  const activePolicy = (cover.policies || []).find(p => ['active', 'grace'].includes(p.status))
    || (cover.policies || [])[0] || null
  const policyBenefits = (cover.benefits || []).filter(b => b.policy_id === activePolicy?.id)

  const enrol = async () => {
    if (!insurerId) { toast.error('Choose your insurer.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('member_request_enrolment', {
      p_insurer_id: insurerId, p_member_reference: memberRef || null,
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not submit enrolment.'); return }
    toast.success('Enrolment submitted — pending insurer verification.')
    await load()
  }

  const toggleConsent = async (scope, granted) => {
    if (!membership) return
    const { error } = await supabase.rpc('member_set_consent', {
      p_membership_id: membership.id, p_scope: scope, p_granted: granted,
    })
    if (error) { toast.error('Could not update consent.'); return }
    await load()
  }

  const requestPreauth = async () => {
    if (!membership) return
    setSaving(true)
    const { error } = await supabase.rpc('member_request_preauth', {
      p_membership_id: membership.id, p_sessions: Number(preauthSessions) || 1,
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not request pre-authorisation.'); return }
    setPreauthSent(true)
    toast.success('Pre-authorisation request sent to your insurer.')
    await load()
  }

  const submitClaim = async () => {
    if (!activePolicy || !claimForm.benefit_code || !claimForm.event_description.trim()) {
      toast.error('Choose a policy, benefit and describe the event.'); return
    }
    setSaving(true)
    const { error } = await supabase.rpc('member_submit_claim', {
      p_policy_id: activePolicy.id,
      p_benefit_code: claimForm.benefit_code,
      p_claim_type: claimForm.claim_type,
      p_event_description: claimForm.event_description.trim(),
      p_event_date: claimForm.event_date || null,
      p_provider_claim_id: null,
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not submit claim.'); return }
    toast.success('Claim submitted for insurer review.')
    setClaimForm({ policy_id: '', benefit_code: '', claim_type: 'fixed_sum', event_description: '', event_date: '' })
    await load()
  }

  const cancelClaim = async (id) => {
    const { error } = await supabase.rpc('member_cancel_claim', { p_claim_id: id })
    if (error) { toast.error(error.message || 'Could not cancel claim.'); return }
    await load()
  }

  const leave = async () => {
    if (!confirm('Leave Protection? Your membership will end, consents are revoked and in-force policies cancelled.')) return
    const { error } = await supabase.rpc('member_leave_protection', { p_membership_id: membership.id })
    if (error) { toast.error(error.message || 'Could not leave Protection.'); return }
    toast.success('You have left Protection.')
    await load()
  }

  if (loading || mode === null) return <BrandLoader variant="fullscreen" />

  if (!protectionModeAllows(mode)) {
    return (
      <div className="page-root"><div className="page-content" style={{ padding: '2rem' }}>
        <h1 className="fs-20" style={{ color: '#FFFFFF' }}>LossLens Protection</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>Protection is not available yet. <a href="/protection" style={{ color: '#2DD4BF' }}>Learn more</a>.</p>
      </div></div>
    )
  }

  const fmtKes = (n) => n == null ? '—' : `KES ${Number(n).toLocaleString()}`

  return (
    <div className="page-root"><div className="page-content" style={{ padding: '1.5rem' }}>
      <h1 className="fs-20" style={{ color: '#FFFFFF', marginBottom: '4px' }}>LossLens Protection</h1>
      <p className="fs-13" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.25rem' }}>Insurance arranged through your insurer. LossLens is not the insurer — your insurer issues the policy, collects premiums and decides claims.</p>

      {!membership ? (
        <div className="dash-section">
          <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '12px' }}>Enrol with your insurer</h2>
          {insurers.length === 0 ? (
            <p className="fs-13" style={{ color: 'rgba(255,255,255,0.5)' }}>No insurers are currently offering Protection. Check back soon.</p>
          ) : (
            <>
              <div className="form-group"><label>Insurer</label>
                <select value={insurerId} onChange={e => setInsurerId(e.target.value)}>
                  <option value="">Select your insurer…</option>
                  {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Member reference (from your policy documents)</label>
                <input type="text" value={memberRef} onChange={e => setMemberRef(e.target.value)} placeholder="e.g. POL-12345" />
              </div>
              <button className="btn-primary full" onClick={enrol} disabled={saving}>
                {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Request enrolment'}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="dash-section" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="fs-15" style={{ color: '#FFFFFF', margin: 0 }}>Your membership</h2>
              <span style={{ color: '#F2C879', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>{membership.status.replace(/_/g, ' ')}</span>
            </div>
            {membership.status === 'pending_verification' && (
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Waiting for your insurer to verify your membership.</p>
            )}
            {membership.status === 'active' && !activePolicy && (
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Your membership is active. Your insurer will issue your policy once premiums are arranged.</p>
            )}
            {membership.status === 'ended' && <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>This membership has ended.</p>}
            {membership.status === 'rejected' && <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Your enrolment was not approved. Contact your insurer.</p>}
          </div>

          {activePolicy && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Your policy</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <p className="fs-13" style={{ color: '#FFFFFF', margin: 0 }}>
                  {activePolicy.policy_number || 'Policy pending number'} · {activePolicy.product_name || ''}
                </p>
                <span style={{ color: POLICY_STATUS_COLOR[activePolicy.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{activePolicy.status.replace(/_/g, ' ')}</span>
              </div>
              <p className="fs-12" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>
                {activePolicy.commencement_date && `Cover from ${activePolicy.commencement_date}`}
                {activePolicy.expiry_date && ` to ${activePolicy.expiry_date}`}
                {' · '}Premium {fmtKes(activePolicy.premium_amount)}/{activePolicy.premium_frequency}
                {' · '}Premium status: {activePolicy.premium_status.replace(/_/g, ' ')}
              </p>
              {activePolicy.waiting_period_ends_at && new Date(activePolicy.waiting_period_ends_at) > new Date() && (
                <p className="fs-12" style={{ color: '#F2C879', marginTop: '4px' }}>
                  Waiting period ends {new Date(activePolicy.waiting_period_ends_at).toLocaleDateString()}.
                </p>
              )}
              {policyBenefits.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {policyBenefits.map(b => (
                    <span key={b.benefit_code} className="fs-12" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '5px 12px', color: '#FFFFFF' }}>
                      {b.name}: {b.benefit_type === 'fixed_sum' ? fmtKes(b.fixed_amount) : `up to ${fmtKes(b.per_event_limit)}/event`}
                    </span>
                  ))}
                </div>
              )}
              <p className="fs-11" style={{ color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Confirm cover details with your insurer. LossLens is not the insurer.</p>
            </div>
          )}

          {consents.length > 0 && membership.status !== 'ended' && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>What you share</h2>
              {consents.map(c => (
                <label key={c.scope} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', color: 'rgba(255,255,255,0.75)', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(c.granted)} onChange={e => toggleConsent(c.scope, e.target.checked)} />
                  {CONSENT_LABELS[c.scope] || c.scope}
                  {c.wording_version && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>v{c.wording_version}</span>}
                </label>
              ))}
              <p className="fs-11" style={{ color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Your diary, chats and clinical records are never shared with your insurer or therapist.</p>
            </div>
          )}

          {events.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Status timeline</h2>
              {events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <AppIcon name="clock" size={14} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p className="fs-13" style={{ color: '#FFFFFF', margin: 0 }}>{String(ev.event_type).replace(/_/g, ' ')}</p>
                    <p className="fs-11" style={{ color: 'rgba(255,255,255,0.4)', margin: 0 }}>{new Date(ev.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {membership.status === 'active' && activePolicy?.status === 'active' && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Request pre-authorisation</h2>
              <p className="fs-12" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>Ask your insurer to approve therapy sessions before you book.</p>
              <div className="form-group"><label>Sessions needed</label>
                <NumberField value={preauthSessions} onChange={v => setPreauthSessions(v ?? 1)} min={1} max={24} />
              </div>
              <button className="btn-primary" onClick={requestPreauth} disabled={saving || preauthSent}>
                {preauthSent ? 'Request sent' : saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Request pre-authorisation'}
              </button>
            </div>
          )}

          {membership.status === 'active' && activePolicy?.status === 'active' && policyBenefits.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Submit a claim</h2>
              <div className="form-group"><label>Benefit</label>
                <select value={claimForm.benefit_code} onChange={e => {
                  const b = policyBenefits.find(x => x.benefit_code === e.target.value)
                  setClaimForm({ ...claimForm, benefit_code: e.target.value, claim_type: b?.benefit_type === 'fixed_sum' ? 'fixed_sum' : 'treatment_reimbursement' })
                }}>
                  <option value="">Select benefit…</option>
                  {policyBenefits.map(b => <option key={b.benefit_code} value={b.benefit_code}>{b.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>What happened? (no clinical detail needed)</label>
                <input type="text" maxLength={1000} value={claimForm.event_description} onChange={e => setClaimForm({ ...claimForm, event_description: e.target.value })} placeholder="e.g. Completed authorised CBT sessions" />
              </div>
              <div className="form-group"><label>Event date</label>
                <input type="date" value={claimForm.event_date} onChange={e => setClaimForm({ ...claimForm, event_date: e.target.value })} />
              </div>
              <button className="btn-primary" onClick={submitClaim} disabled={saving || !claimForm.benefit_code}>
                {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Submit claim'}
              </button>
            </div>
          )}

          {claims.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Your claims</h2>
              {claims.map(c => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <p className="fs-13" style={{ color: '#FFFFFF', margin: 0 }}>
                      {c.claim_type === 'fixed_sum' ? 'Fixed-sum claim' : 'Treatment claim'} · {fmtKes(c.approved_amount ?? c.claimed_amount)}
                    </p>
                    <span style={{ color: CLAIM_STATUS_COLOR[c.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{c.status.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="fs-11" style={{ color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>
                    {c.event_description}{c.event_date ? ` · ${c.event_date}` : ''}
                    {c.decision_reason ? ` · ${c.decision_reason}` : ''}
                  </p>
                  {['submitted', 'info_requested'].includes(c.status) && (
                    <button className="btn-ghost fs-11" style={{ marginTop: '6px', padding: '4px 10px' }} onClick={() => cancelClaim(c.id)}>Cancel claim</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {therapists.length > 0 && membership.status === 'active' && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Find a verified therapist</h2>
              {therapists.map(t => (
                <div key={t.therapist_ref} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="fs-13" style={{ color: '#FFFFFF', margin: 0 }}>{t.specialty || 'Therapist'}</p>
                  <p className="fs-11" style={{ color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>
                    {[t.county, (t.languages || []).join(', ')].filter(Boolean).join(' · ')}
                    {t.telehealth ? ' · Telehealth available' : ''}
                    {t.session_fee ? ` · ${fmtKes(t.session_fee)}/session` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {membership.status === 'active' && (
            <button className="btn-ghost full" onClick={leave}>Leave Protection</button>
          )}
        </>
      )}
    </div></div>
  )
}
