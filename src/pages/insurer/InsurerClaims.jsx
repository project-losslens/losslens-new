import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toCsv, downloadCsv } from '../../lib/csv'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Protection claims adjudication (fixed-sum / treatment-reimbursement).
//  Whitelisted via insurer_list_protection_claims / insurer_get_claim /
//  insurer_adjudicate_claim — no clinical data. Direct payment tracking replaces
//  the retired settlement mutation; an insurer report is not receipt confirmation.

const PCL_STATUS_COLOR = {
  submitted: 'var(--warning)', under_review: 'var(--secondary)', info_requested: 'var(--secondary)',
  approved: 'var(--primary)', partially_approved: 'var(--primary)', paid: 'var(--primary)',
  rejected: 'var(--danger)', disputed: 'var(--danger)', cancelled: 'rgba(255,255,255,0.4)',
}

function ProtectionClaims() {
  const [rows, setRows] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [decision, setDecision] = useState({ decision: 'approved', amount: '', reason: '' })
  const [evidenceFiles, setEvidenceFiles] = useState(null) // null=not loaded
  const [evidenceBusy, setEvidenceBusy] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')

  const loadEvidence = async () => {
    if (!detail) return
    setEvidenceBusy(true)
    setEvidenceError('')
    const { data, error } = await supabase.rpc('insurer_get_claim_evidence', { p_claim_id: detail.id })
    if (error) {
      setEvidenceBusy(false)
      setEvidenceError(error.message || 'Could not load evidence.')
      toast.error(error.message || 'Could not load evidence.')
      return
    }
    // Convert private-bucket paths to 5-minute signed URLs.
    let signedUrlFailed = false
    const withUrls = await Promise.all((data || []).map(async ev => {
      if (!ev.storage_path) return { ...ev, url: null }
      const { data: signed, error: signError } = await supabase.storage
        .from('claim-evidence').createSignedUrl(ev.storage_path, 300)
      if (signError || !signed?.signedUrl) {
        signedUrlFailed = true
        return { ...ev, url: null, urlError: signError?.message || 'Could not create a secure file link.' }
      }
      return { ...ev, url: signed.signedUrl }
    }))
    setEvidenceBusy(false)
    if (signedUrlFailed) {
      setEvidenceError('Some evidence files could not be opened.')
      toast.error('Some evidence files could not be opened.')
    }
    setEvidenceFiles(withUrls)
    if (evidenceFiles && !signedUrlFailed) toast.success('Evidence up to date.')
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('insurer_list_protection_claims')
    if (error) toast.error(error.message || 'Could not load Protection claims.')
    else setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const open = async (claimId) => {
    const { data, error } = await supabase.rpc('insurer_get_claim', { p_claim_id: claimId })
    if (error) { toast.error(error.message || 'Could not load claim.'); return }
    setDetail(data)
    setEvidenceFiles(null)
    setEvidenceError('')
    setDecision({ decision: 'approved', amount: data?.claimed_amount ?? '', reason: '' })
  }

  const adjudicate = async () => {
    if (!detail) return
    setWorking(detail.id)
    const { error } = await supabase.rpc('insurer_adjudicate_claim', {
      p_claim_id: detail.id,
      p_decision: decision.decision,
      p_approved_amount: decision.decision === 'rejected' || decision.decision === 'request_info' ? null : (Number(decision.amount) || null),
      p_reason: decision.reason?.trim() || null,
    })
    setWorking('')
    if (error) { toast.error(error.message || 'Adjudication failed.'); return }
    toast.success('Decision recorded.')
    setDetail(null)
    await load()
  }



  if (loading) return null
  return (
    <section className="portal-card" style={{ marginTop: '1.5rem' }}>
      <h3>Protection claims ({rows.length})</h3>
      <p className="portal-notice">Fixed-sum and treatment-cost claims. Approved amounts are capped by the product benefit schedule; decisions are recorded with your identity.</p>
      {rows.length === 0 && <p className="portal-notice">No Protection claims submitted.</p>}
      {rows.map(c => (
        <div key={c.claim_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>
              {c.policy_number || 'Policy'} · {c.member_reference} · {c.claim_type === 'fixed_sum' ? 'Fixed sum' : 'Treatment'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>
              KES {Number(c.claimed_amount).toLocaleString()}{c.approved_amount != null ? ` · approved KES ${Number(c.approved_amount).toLocaleString()}` : ''} · {c.event_date || ''}
            </p>
          </div>
          <span style={{ color: PCL_STATUS_COLOR[c.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{c.status.replace(/_/g, ' ')}</span>
          <button type="button" className="btn-ghost fs-11" style={{ padding: '6px 10px', minHeight: '32px' }} onClick={() => open(c.claim_id)}>Review</button>
        </div>
      ))}
      {detail && (
        <div style={{ marginTop: '12px', padding: '12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px' }}>
          <p style={{ color: '#FFFFFF', fontSize: '13px', margin: '0 0 6px' }}>
            {detail.member_reference} · {detail.claim_type === 'fixed_sum' ? 'Fixed sum' : 'Treatment'} · claimed KES {Number(detail.claimed_amount).toLocaleString()}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 10px' }}>
            Benefit: {detail.benefit_name || detail.benefit_code || '—'} · Status: {detail.status.replace(/_/g, ' ')}
            {detail.milestone && <> · Milestone: {detail.milestone.type} #{detail.milestone.ordinal} · service {detail.milestone.service_date} · verified {detail.milestone.verified_at ? new Date(detail.milestone.verified_at).toLocaleDateString() : '—'}</>}
          </p>
          <div style={{ marginBottom: '10px' }}>
            <button type="button" className="btn-ghost fs-11" style={{ padding: '4px 10px' }} disabled={evidenceBusy} onClick={loadEvidence}>
              {evidenceBusy ? 'Loading…' : evidenceFiles ? 'Refresh evidence' : 'View evidence'}
            </button>
            {evidenceError && <p role="alert" className="portal-notice" style={{ marginTop: '6px', color: 'var(--danger)' }}>{evidenceError}</p>}
            {evidenceFiles && evidenceFiles.length === 0 && <p className="portal-notice" style={{ marginTop: '6px' }}>No evidence attached.</p>}
            {evidenceFiles?.map(ev => (
              <p key={ev.id} className="fs-11" style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                {ev.evidence_type || 'document'} · {new Date(ev.created_at).toLocaleDateString()}
                {ev.url && <> · <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Open (5 min)</a></>}
                {ev.urlError && <> · <span role="alert" style={{ color: 'var(--danger)' }}>{ev.urlError}</span></>}
              </p>
            ))}
          </div>
          {['submitted', 'under_review', 'info_requested'].includes(detail.status) && (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Decision
                  <select value={decision.decision} onChange={e => setDecision({ ...decision, decision: e.target.value })}
                    style={{ display: 'block', marginTop: '4px', background: 'var(--bg)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '6px 8px' }}>
                    <option value="approved">Approve</option>
                    <option value="partially_approved">Partially approve</option>
                    <option value="rejected">Reject</option>
                    <option value="request_info">Request information</option>
                  </select>
                </label>
                {['approved', 'partially_approved'].includes(decision.decision) && (
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Approved amount (KES)
                    <NumberField value={decision.amount} onChange={v => setDecision({ ...decision, amount: v ?? '' })} min={0} />
                  </label>
                )}
              </div>
              <input type="text" maxLength={2000} placeholder="Decision reason (required for rejection)"
                value={decision.reason} onChange={e => setDecision({ ...decision, reason: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'var(--bg)', color: '#fff', fontSize: '13px' }} />
              <button type="button" className="btn-primary fs-12" disabled={working === detail.id} onClick={adjudicate}>
                {working === detail.id ? 'Saving…' : 'Record decision'}
              </button>
            </>
          )}
          {['approved', 'partially_approved'].includes(detail.status) && (
            <a className="btn-secondary" href="/insurer/invoices">Track direct insurer payment</a>
          )}
          <div style={{ marginTop: '10px' }}>
            <button type="button" className="btn-ghost fs-11" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  )
}



const CLAIM_CSV_COLUMNS = [
  { key: 'claim_id', label: 'Claim ID' },
  { key: 'session_date', label: 'Session Date' },
  { key: 'claim_amount', label: 'Amount (KES)' },
  { key: 'claim_status', label: 'Claim Status' },
  { key: 'insurer_status', label: 'Insurer Status' },
  { key: 'submitted_at', label: 'Submitted At' },
]

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

  const exportCsv = () => {
    const rows = claims.map((c) => ({
      claim_id: c.claim_id,
      session_date: c.session_date,
      claim_amount: c.claim_amount,
      claim_status: c.claim_status,
      insurer_status: c.insurer_status,
      submitted_at: c.submitted_at,
    }))
    downloadCsv('losslens-claims.csv', toCsv(rows, CLAIM_CSV_COLUMNS))
  }

  if (loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div>
          <p className="portal-page__eyebrow">Insurer portal</p>
          <h2>Claim adjudication</h2>
        </div>
        <div className="portal-page__actions">
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={claims.length === 0}>Export CSV</button>
        </div>
      </header>
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
      <ProtectionClaims />
    </section>
  )
}
