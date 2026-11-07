import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function InsurerClaims() {
  const [claims, setClaims] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('insurer_list_claims')
    if (loadError) {
      console.error('Insurer claims load failed:', loadError)
      setError('Could not load claims. Please retry.')
    } else {
      setClaims(data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const review = async (claim, action) => {
    if (action === 'reject' && !notes[claim.claim_id]?.trim()) {
      setError('Enter a reason before rejecting a claim.')
      return
    }
    setWorking(claim.claim_id)
    setError('')
    const rpc = action === 'approve' ? 'insurer_approve_claim' : 'insurer_reject_claim'
    const { error: reviewError } = await supabase.rpc(rpc, {
      p_claim_id: claim.claim_id,
      p_notes: notes[claim.claim_id]?.trim() || null,
    })
    if (reviewError) {
      console.error('Insurer claim review failed:', reviewError)
      setError('Could not update this claim.')
    } else await load()
    setWorking('')
  }

  if (loading) return <p role="status">Loading claims...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Insurer portal</p>
      <h2>Claim adjudication</h2>
      <p>Claim details are limited to session date, amount, and adjudication status. Clinical notes and member recovery data are not available here.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {claims.length === 0 ? <p>No submitted claims are available.</p> : (
        <div className="portal-list">
          {claims.map((claim) => (
            <article className="portal-card" key={claim.claim_id}>
              <div className="portal-page__heading">
                <div><strong>{claim.claim_id}</strong><p>{claim.session_date} · KES {Number(claim.claim_amount).toLocaleString()}</p></div>
                <span className={`portal-status portal-status--${claim.insurer_status}`}>{claim.insurer_status}</span>
              </div>
              {claim.insurer_notes && <p>{claim.insurer_notes}</p>}
              {claim.insurer_status === 'submitted' && (
                <>
                  <label>Adjudication note<textarea maxLength={2000} rows={2} value={notes[claim.claim_id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [claim.claim_id]: event.target.value }))} /></label>
                  <div className="portal-form__actions">
                    <button className="btn-primary" disabled={working === claim.claim_id} onClick={() => review(claim, 'approve')}>Approve</button>
                    <button className="btn-ghost" disabled={working === claim.claim_id} onClick={() => review(claim, 'reject')}>Reject</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
