import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { METRIC_DEFINITIONS } from '../../lib/metrics'

function FloatStat({ label, value, definition }) {
  return (
    <article className="portal-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {definition && <details className="metric-def"><summary>Definition</summary><p>{definition}</p></details>}
    </article>
  )
}

export default function FloatManagement() {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [pendingInvoices, setPendingInvoices] = useState([])
  const [invoiceReferences, setInvoiceReferences] = useState({})
  const [unreimbursedClaims, setUnreimbursedClaims] = useState([])
  const [burnRate, setBurnRate] = useState(0)
  const [form, setForm] = useState({ type: 'inflow', amount: '', note: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [floatResult, transactionResult, invoiceResult, claimResult] = await Promise.all([
      supabase.from('claims_float').select('balance, updated_at, note').eq('id', 1).maybeSingle(),
      supabase.from('claims_float_transactions').select('id, type, amount, note, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('bulk_invoices').select('id, total_amount, insurer_id, status, payment_reference').in('status', ['sent', 'payment_reported']),
      supabase.from('provider_claims').select('id, claim_amount, therapist_id, insurer_reimbursed_at').eq('status', 'paid').is('insurer_reimbursed_at', null),
    ])
    const failure = floatResult.error || transactionResult.error || invoiceResult.error || claimResult.error
    if (failure) {
      console.error('Claims float load failed:', failure)
      setError('Could not load float data. Confirm super-admin access and retry.')
    } else {
      setBalance(Number(floatResult.data?.balance || 0))
      setTransactions(transactionResult.data || [])
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      setBurnRate((transactionResult.data || [])
        .filter((transaction) => transaction.type === 'outflow' && new Date(transaction.created_at).getTime() >= cutoff)
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0))
      setPendingInvoices(invoiceResult.data || [])
      setUnreimbursedClaims(claimResult.data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const daysUntilDepleted = burnRate > 0 ? Math.floor(balance / (burnRate / 30)) : null
  const pendingReimbursement = pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0)
  const outstandingTherapistClaims = unreimbursedClaims.reduce((sum, claim) => sum + Number(claim.claim_amount), 0)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { error: adjustError } = await supabase.rpc('admin_adjust_claims_float', {
      p_type: form.type,
      p_amount: Number(form.amount),
      p_note: form.note.trim() || null,
    })
    if (adjustError) {
      console.error('Claims float adjustment failed:', adjustError)
      setError('Could not record this float transaction.')
    } else {
      setForm({ type: 'inflow', amount: '', note: '' })
      await load()
    }
    setSaving(false)
  }

  const confirmInvoicePayment = async (invoice) => {
    const reference = (invoiceReferences[invoice.id] || invoice.payment_reference || '').trim()
    if (!reference) {
      setError('A verified payment reference is required.')
      return
    }
    setSaving(true)
    setError('')
    const { error: confirmError } = await supabase.rpc('admin_confirm_invoice_payment', {
      p_invoice_id: invoice.id,
      p_reference: reference,
    })
    if (confirmError) {
      console.error('Invoice payment confirmation failed:', confirmError)
      setError('Could not confirm this invoice payment. Reauthenticate and retry.')
    } else {
      setInvoiceReferences((current) => ({ ...current, [invoice.id]: '' }))
      await load()
    }
    setSaving(false)
  }

  if (loading) return <p role="status">Loading claims float...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Admin operations</p>
      <h2>Claims float</h2>
      <p>The float pays approved therapist claims before insurer reimbursement. Insurer-reported payments are credited only after recent-auth super-admin confirmation.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      <div className="portal-stats">
        <FloatStat label="Current balance" value={`KES ${balance.toLocaleString()}`} definition={METRIC_DEFINITIONS.floatBalance} />
        <FloatStat label="30-day outflow" value={`KES ${burnRate.toLocaleString()}`} definition={METRIC_DEFINITIONS.burnRate30d} />
        <FloatStat label="Days until depleted" value={daysUntilDepleted == null ? 'No recent burn' : daysUntilDepleted} definition={METRIC_DEFINITIONS.daysUntilDepleted} />
        <FloatStat label="Pending insurer invoices" value={`KES ${pendingReimbursement.toLocaleString()}`} definition={METRIC_DEFINITIONS.pendingReimbursement} />
        <FloatStat label="Paid therapist claims awaiting reimbursement" value={`KES ${outstandingTherapistClaims.toLocaleString()}`} definition={METRIC_DEFINITIONS.outstandingClaims} />
      </div>
      <form className="portal-card portal-form" onSubmit={submit}>
        <h3>Record float adjustment</h3>
        <label>Transaction type
          <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
          </select>
        </label>
        <label>Amount (KES)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
        <label>Note<input maxLength={500} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
        <button className="btn-primary" disabled={saving}>{saving ? 'Recording...' : 'Record transaction'}</button>
      </form>
      <section className="portal-card">
        <h3>Insurer invoice payments</h3>
        {pendingInvoices.length === 0 ? <p>No insurer invoice payments are awaiting processing.</p> : (
          <div className="portal-list">
            {pendingInvoices.map((invoice) => (
              <article className="portal-list__item" key={invoice.id}>
                <div>
                  <strong>{invoice.status} · KES {Number(invoice.total_amount).toLocaleString()}</strong>
                  <p>{invoice.payment_reference ? `Reported reference: ${invoice.payment_reference}` : 'Awaiting insurer payment report'}</p>
                </div>
                {invoice.status === 'payment_reported' && (
                  <div className="portal-form__actions">
                    <input
                      aria-label={`Verified reference for invoice ${invoice.id}`}
                      maxLength={200}
                      placeholder="Verify payment reference"
                      value={invoiceReferences[invoice.id] ?? invoice.payment_reference ?? ''}
                      onChange={(event) => setInvoiceReferences((current) => ({ ...current, [invoice.id]: event.target.value }))}
                    />
                    <button className="btn-primary" type="button" disabled={saving} onClick={() => confirmInvoicePayment(invoice)}>
                      {saving ? 'Confirming...' : 'Confirm and credit float'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="portal-card">
        <h3>Recent float transactions</h3>
        {transactions.length === 0 ? <p>No float transactions recorded.</p> : (
          <div className="portal-list">
            {transactions.map((transaction) => (
              <article className="portal-list__item" key={transaction.id}>
                <div><strong>{transaction.type} · KES {Number(transaction.amount).toLocaleString()}</strong><p>{transaction.note || 'No note'}</p></div>
                <span>{new Date(transaction.created_at).toLocaleString()}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
