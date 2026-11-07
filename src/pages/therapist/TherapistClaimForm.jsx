import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function TherapistClaimForm() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const voucherId = searchParams.get('voucher')
  const [notes, setNotes] = useState('')
  const [icd, setIcd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!voucherId) {
      setError('A voucher is required to submit a claim.')
      return
    }
    setSaving(true)
    setError('')
    const { error: claimError } = await supabase.rpc('therapist_complete_session', {
      p_voucher_id: voucherId,
      p_notes: notes.trim(),
      p_icd: icd.trim() || null,
    })
    if (claimError) {
      console.error('Therapist claim submission failed:', claimError)
      setError(claimError.message || 'Could not submit the claim.')
      setSaving(false)
      return
    }
    navigate('/therapist', { replace: true })
  }

  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Claims</p>
      <h2>Submit session claim</h2>
      <p>Use the assigned voucher and enter only the minimum clinical details needed for adjudication.</p>
      {error && <p className="portal-error" role="alert">{error}</p>}
      <form className="portal-form" onSubmit={submit}>
        <label>Clinical session note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} required maxLength={4000} rows={6} /></label>
        <label>ICD code (optional)<input value={icd} onChange={(event) => setIcd(event.target.value)} maxLength={20} /></label>
        <p>The authorized session fee is applied to your claim automatically.</p>
        <div className="portal-form__actions">
          <Link className="btn-ghost" to="/therapist">Cancel</Link>
          <button className="btn-primary" disabled={saving || !voucherId}>{saving ? 'Submitting...' : 'Submit claim'}</button>
        </div>
      </form>
    </section>
  )
}
