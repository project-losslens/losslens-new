import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getProtectionMode, protectionModeAllows } from '../../lib/protectionMode'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import AppIcon from '../../components/AppIcon'

//  Member-facing LossLens Protection screens. Entirely mode-gated:
//  concept mode shows the same teaser/register-interest as /protection.
//  Copy here is for pilot/live and is pending legal review.

const CONSENT_LABELS = {
  status_updates: 'Share my membership status with my insurer',
  session_summaries: 'Share session summaries (no clinical detail)',
  billing_contact: 'Share billing contact details',
}

export default function ProtectionPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [insurers, setInsurers] = useState([])
  const [membership, setMembership] = useState(null)
  const [consents, setConsents] = useState([])
  const [events, setEvents] = useState([])
  const [insurerId, setInsurerId] = useState('')
  const [memberRef, setMemberRef] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      const m = await getProtectionMode()
      setMode(m)
      if (!protectionModeAllows(m)) { setLoading(false); return }
      await load()
      setLoading(false)
    })()
  }, [])

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/login'); return }
    const [{ data: ins }, { data: mems }] = await Promise.all([
      supabase.from('insurers').select('id, name').eq('status', 'active'),
      supabase.from('protection_memberships').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1),
    ])
    setInsurers(ins || [])
    const mem = mems?.[0] || null
    setMembership(mem)
    if (mem) {
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from('protection_consents').select('*').eq('membership_id', mem.id),
        supabase.from('protection_events').select('id, event_type, created_at').eq('membership_id', mem.id).order('created_at', { ascending: false }).limit(10),
      ])
      setConsents(c || [])
      setEvents(e || [])
    }
  }

  const enrol = async () => {
    if (!insurerId) { toast.error('Choose your insurer.'); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('member_request_enrolment', {
      p_insurer_id: insurerId,
      p_member_reference: memberRef || null,
    })
    if (error) { toast.error(error.message || 'Could not submit enrolment.'); setSaving(false); return }
    toast.success('Enrolment submitted — pending insurer verification.')
    setSaving(false)
    await load()
  }

  const toggleConsent = async (scope, granted) => {
    const { error } = await supabase.rpc('member_set_consent', {
      p_membership_id: membership.id, p_scope: scope, p_granted: granted,
    })
    if (error) { toast.error('Could not update consent.'); return }
    setConsents(prev => prev.map(c => c.scope === scope ? { ...c, granted } : c))
  }

  const leave = async () => {
    if (!confirm('Leave Protection? Your membership will end and consents are revoked.')) return
    await supabase.from('protection_consents').update({ granted: false, revoked_at: new Date().toISOString() }).eq('membership_id', membership.id)
    await supabase.from('protection_memberships').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', membership.id)
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

  const statusColor = { pending_verification: '#F2C879', active: '#2DD4BF', suspended: '#7DBDEE', ended: 'rgba(255,255,255,0.4)', rejected: '#ff9b9b' }

  return (
    <div className="page-root"><div className="page-content" style={{ padding: '1.5rem' }}>
      <h1 className="fs-20" style={{ color: '#FFFFFF', marginBottom: '4px' }}>LossLens Protection</h1>
      <p className="fs-13" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.25rem' }}>Therapy cover arranged through your insurer. LossLens is not the insurer — your insurer decides cover and claims.</p>

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
              <span style={{ color: statusColor[membership.status] || '#fff', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>{membership.status.replace(/_/g, ' ')}</span>
            </div>
            {membership.status === 'pending_verification' && (
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Waiting for your insurer to verify your membership. This usually takes a few days.</p>
            )}
            {membership.status === 'active' && (
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Your membership is active. Covered therapy sessions and pre-authorisation are available below.</p>
            )}
            {membership.status === 'suspended' && <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Your membership is suspended. Contact your insurer for details.</p>}
            {membership.status === 'ended' && <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>This membership has ended.</p>}
            {membership.status === 'rejected' && <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', marginTop: '8px' }}>Your enrolment was not approved. Contact your insurer.</p>}
          </div>

          {consents.length > 0 && membership.status !== 'ended' && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>What you share</h2>
              {consents.map(c => (
                <label key={c.scope} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', color: 'rgba(255,255,255,0.75)', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(c.granted)} onChange={e => toggleConsent(c.scope, e.target.checked)} />
                  {CONSENT_LABELS[c.scope] || c.scope}
                </label>
              ))}
              <p className="fs-11" style={{ color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Your diary, chats and clinical records are never shared with your insurer or therapist.</p>
            </div>
          )}

          {events.length > 0 && (
            <div className="dash-section" style={{ marginBottom: '1rem' }}>
              <h2 className="fs-15" style={{ color: '#2DD4BF', marginBottom: '10px' }}>Status timeline</h2>
              {events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <AppIcon name="clock" size={14} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p className="fs-13" style={{ color: '#FFFFFF', margin: 0 }}>{ev.event_type.replace(/_/g, ' ')}</p>
                    <p className="fs-11" style={{ color: 'rgba(255,255,255,0.4)', margin: 0 }}>{new Date(ev.created_at).toLocaleString()}</p>
                  </div>
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
