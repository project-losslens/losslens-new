import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'

const label = value => String(value || '').replace(/_/g, ' ')
export function DirectPaymentTracking({ readOnly = false }) {
  const { role } = useAuthProfile()
  const [rows, setRows] = useState([])
  const [forms, setForms] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const requests = useRef({})
  const inFlight = useRef(new Set())
  const load = useCallback(async () => {
    const result = await supabase.rpc('protection_payment_queue')
    if (result.error || !Array.isArray(result.data)) setError('Could not load direct payments. Refresh or contact LossLens support to check your portal access.')
    else { setRows(result.data || []); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const edit = (id, field, value) => { delete requests.current[id]; setForms(old => ({ ...old, [id]: { ...old[id], [field]: value } })) }
  const update = async (row, status) => {
    if (inFlight.current.has(row.claim_id)) return
    inFlight.current.add(row.claim_id)
    const f = forms[row.claim_id] || {}
    setBusy(row.claim_id); setError('')
    try {
      let receiptPath = f.receiptPath || null
      if (status === 'insurer_reported_paid' && f.kind === 'receipt') {
        if (!f.file || f.file.size > 10485760 || !['application/pdf','image/png','image/jpeg'].includes(f.file.type)) throw new Error('Select a PDF, PNG or JPEG receipt, no larger than 10 MB.')
        if (!receiptPath) {
          receiptPath = `${row.insurer_id}/${row.claim_id}/${crypto.randomUUID()}.${f.file.type === 'application/pdf' ? 'pdf' : f.file.type === 'image/png' ? 'png' : 'jpg'}`
          const upload = await supabase.storage.from('protection-payment-receipts').upload(receiptPath, f.file, { upsert: false, contentType: f.file.type })
          if (upload.error) throw upload.error
          setForms(old => ({ ...old, [row.claim_id]: { ...old[row.claim_id], receiptPath } }))
        }
      }
      const payload = { p_claim: row.claim_id, p_status: status, p_expected_status: row.status,
        p_amount: role === 'insurer' ? Number(f.amount || row.amount) : null,
        p_date: status === 'insurer_reported_paid' ? f.date || null : null,
        p_reference: status === 'insurer_reported_paid' ? f.reference || null : null,
        p_evidence_type: status === 'insurer_reported_paid' ? f.kind || 'written_confirmation' : null,
        p_evidence_text: status === 'insurer_reported_paid' || status === 'issue_reported' ? f.text || null : null,
        p_receipt_path: status === 'insurer_reported_paid' && f.kind === 'receipt' ? receiptPath : null }
      const fingerprint = JSON.stringify(payload)
      if (requests.current[row.claim_id]?.fingerprint !== fingerprint) requests.current[row.claim_id] = { fingerprint, id: crypto.randomUUID() }
      const result = await supabase.rpc('protection_payment_update', { ...payload, p_request: requests.current[row.claim_id].id })
      if (result.error) throw result.error
      if (result.data?.status !== status) throw new Error('Payment update was not confirmed. Refresh before retrying.')
      delete requests.current[row.claim_id]
      await load()
    } catch (failure) { setError(failure.message || 'Payment update failed. Check the current record before retrying.') }
    finally { inFlight.current.delete(row.claim_id); setBusy('') }
  }
  const openReceipt = async path => {
    const result = await supabase.storage.from('protection-payment-receipts').createSignedUrl(path, 60)
    if (result.error || !result.data?.signedUrl) { setError('This receipt could not be opened. Check your access and retry.'); return }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  if (loading) return <BrandLoader variant="section" />
  return <section className="portal-card direct-payments">
    <h2>Direct insurer payments</h2>
    <p>The insurer pays the therapist outside LossLens. This view tracks reports and receipt acknowledgements; it does not send money or independently verify M-Pesa.</p>
    {error && <p role="alert" className="portal-error">{error} <button type="button" onClick={load}>Refresh</button></p>}
    {!error && !rows.length && <p>No approved treatment payments are available.</p>}
    {rows.map(row => { const f = forms[row.claim_id] || {}; return <article className="portal-card" key={row.claim_id}>
      <h3>{row.insurer} to {row.therapist || 'Assigned therapist'}</h3>
      <p>Claim {row.claim_id} · <strong>{row.currency} {Number(row.amount).toLocaleString()}</strong> · {label(row.status)}</p>
      <p>Approved amount: {row.currency} {Number(row.approved_amount).toLocaleString()}{row.payment_date ? ` · Reported payment date: ${row.payment_date}` : ''}{row.reference ? ` · Reference: ${row.reference}` : ''}</p>
      {!readOnly && role === 'insurer' && row.status !== 'receipt_confirmed' && <form className="portal-form" onSubmit={event => { event.preventDefault(); void update(row,'insurer_reported_paid') }}>
        <label>Amount (KES)<input type="number" min="0.01" max={row.approved_amount} step="0.01" value={f.amount ?? row.amount} onChange={e => edit(row.claim_id,'amount',e.target.value)} required /></label>
        <label>Payment date<input type="date" value={f.date || ''} max={new Date().toISOString().slice(0,10)} onChange={e => edit(row.claim_id,'date',e.target.value)} required /></label>
        <label>Reference (if available)<input maxLength={200} value={f.reference || ''} onChange={e => edit(row.claim_id,'reference',e.target.value)} /></label>
        <label>One evidence option<select value={f.kind || 'written_confirmation'} onChange={e => edit(row.claim_id,'kind',e.target.value)}><option value="written_confirmation">Written confirmation</option><option value="mpesa_message">Redacted M-Pesa message</option><option value="receipt">Private receipt upload</option></select></label>
        {f.kind === 'receipt' ? <label>Receipt (PDF, PNG or JPEG, up to 10 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => { edit(row.claim_id,'file',e.target.files?.[0]); edit(row.claim_id,'receiptPath',null) }} required /></label> : <label>{f.kind === 'mpesa_message' ? 'Redacted confirmation message' : 'Written payment confirmation'}<textarea minLength={5} maxLength={4000} value={f.text || ''} onChange={e => edit(row.claim_id,'text',e.target.value)} required /></label>}
        <p>Remove unrelated phone numbers, balances and personal information. Evidence is supplied by your company, not verified by the payment provider.</p>
        <div className="portal-form__actions"><button type="button" className="btn-secondary" disabled={busy === row.claim_id} onClick={() => update(row,'processing')}>Mark processing</button><button className="btn-primary" disabled={busy === row.claim_id}>Report payment</button></div>
      </form>}
      {!readOnly && role === 'therapist' && ['insurer_reported_paid','receipt_confirmed','issue_reported'].includes(row.status) && <div className="portal-form">
        <label>Discrepancy details (required to flag an issue)<textarea maxLength={4000} value={f.text || ''} onChange={e => edit(row.claim_id,'text',e.target.value)} /></label>
        <div className="portal-form__actions"><button type="button" className="btn-primary" disabled={busy === row.claim_id} onClick={() => update(row,'receipt_confirmed')}>Confirm receipt</button><button type="button" className="btn-secondary" disabled={busy === row.claim_id} onClick={() => update(row,'issue_reported')}>Flag discrepancy</button></div>
      </div>}
      <details><summary>Payment history and evidence</summary><ol>{(row.events || []).map(event => <li key={event.id}>{label(event.status)} · {new Date(event.created_at).toLocaleString()} · {event.currency} {event.amount}{event.reference ? ` · ${event.reference}` : ''}{event.evidence_text && <p>{event.evidence_text}</p>}{event.receipt_path && <button type="button" onClick={() => openReceipt(event.receipt_path)}>Open private receipt</button>}</li>)}</ol></details>
    </article> })}
  </section>
}

export default function InsurerInvoices() {
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void supabase.from('bulk_invoices').select('id,invoice_period_start,invoice_period_end,total_amount,status,paid_at,payment_reference').order('created_at', { ascending: false }).then(result => { if (!active) return; if (result.error) setError('Historical invoices could not be loaded.'); else setHistory(result.data || []) }); return () => { active=false } }, [])
  return <section className="portal-page"><DirectPaymentTracking /><details className="portal-card"><summary>Historical bulk invoices (read only)</summary>{error && <p role="alert">{error}</p>}{history.map(row => <p key={row.id}>{row.invoice_period_start} to {row.invoice_period_end} · KES {Number(row.total_amount).toLocaleString()} · {row.status} · {row.payment_reference || 'No reference'}</p>)}</details></section>
}
