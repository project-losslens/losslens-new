import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Therapist portal — Protection treatment-milestone verification.
//  Clinician attestation only; shares eligibility fields (type, ordinal,
//  service date, plan ref) — never clinical notes (stripped server-side).

const MILESTONES = [
  { value: 'entry', label: 'Entry — assessment + treatment plan' },
  { value: 'course', label: 'Course — stage/attendance milestone' },
  { value: 'reengagement', label: 'Re-engagement — return to treatment' },
]

export default function TherapistMilestones() {
  const [episodes, setEpisodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState({})
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('therapist_list_assigned_episodes')
    if (error) toast.error(error.message || 'Could not load assigned episodes.')
    else setEpisodes(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const verify = async (ep) => {
    const f = forms[ep.id] || { milestone_type: 'entry', ordinal: 1, service_date: '' }
    setWorking(ep.id)
    const { error } = await supabase.rpc('therapist_verify_milestone', {
      p_episode_id: ep.id,
      p_milestone_type: f.milestone_type,
      p_ordinal: Number(f.ordinal) || 1,
      p_service_date: f.service_date || null,
    })
    setWorking('')
    if (error) { toast.error(error.message || 'Verification failed.'); return }
    toast.success('Milestone verified.')
    setForms(p => ({ ...p, [ep.id]: { milestone_type: 'entry', ordinal: 1, service_date: '' } }))
    await load()
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Therapist portal</p><h2>Treatment milestones</h2></div>
      </header>
      <p className="portal-notice">Verify insurance milestones for members on your caseload. The insurer receives only the milestone type, ordinal, service date and verification timestamp. Do not enter clinical notes here.</p>
      {episodes.length === 0 && <p className="portal-notice">No assigned treatment episodes.</p>}
      {episodes.map(ep => {
        const f = forms[ep.id] || { milestone_type: 'entry', ordinal: 1, service_date: '' }
        const verifiable = ['open', 'interrupted'].includes(ep.status)
        return (
          <section key={ep.id} className="portal-card" style={{ marginBottom: '1rem' }}>
            <h3>Member {ep.member_reference || '—'} · {ep.policy_number || 'policy'}</h3>
            <p className="portal-notice">
              Episode {ep.status} · started {ep.started_at}{ep.plan_ref ? ` · plan ${ep.plan_ref}` : ''}
            </p>
            {ep.milestones?.length > 0 && (
              <p className="fs-12" style={{ color: 'var(--text-muted)' }}>
                Verified: {ep.milestones.map(m => `${m.milestone_type}#${m.ordinal}`).join(', ') || 'none'}
              </p>
            )}
            {verifiable && (
              <div className="portal-form" style={{ marginTop: '10px' }}>
                <label>Milestone
                  <select value={f.milestone_type} onChange={e => setForms(p => ({ ...p, [ep.id]: { ...f, milestone_type: e.target.value } }))}>
                    {MILESTONES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label>Ordinal (course stage)<NumberField value={f.ordinal} min={1} max={52} onChange={v => setForms(p => ({ ...p, [ep.id]: { ...f, ordinal: v ?? 1 } }))} /></label>
                <label>Service date<input type="date" value={f.service_date} onChange={e => setForms(p => ({ ...p, [ep.id]: { ...f, service_date: e.target.value } }))} /></label>
                <button type="button" className="btn-primary fs-12" disabled={working === ep.id} onClick={() => verify(ep)}>
                  {working === ep.id ? 'Saving…' : 'Verify milestone'}
                </button>
              </div>
            )}
          </section>
        )
      })}
    </section>
  )
}
