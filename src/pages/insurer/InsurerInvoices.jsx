import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function InsurerInvoices() {
  const [invoices, setInvoices] = useState([])
  const [references, setReferences] = useState({})
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('bulk_invoices')
      .select('id, invoice_period_start, invoice_period_end, total_claims, total_amount, status, sent_at, paid_at, mpesa_or_ach_ref, payment_reference, payment_reported_at')
      .order('invoice_period_end', { ascending: false })
    if (loadError) {
      console.error('Insurer invoice load failed:', loadError)
      setError('Could not load invoices.')
    } else {
      setInvoices(data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const exportInvoice = async (invoice) => {
    setWorking(invoice.id)
    const { data, error: exportError } = await supabase.rpc('insurer_export_invoice_csv', { p_invoice_id: invoice.id })
    if (exportError) {
      console.error('Invoice export failed:', exportError)
      setError('Could not export this invoice.')
      setWorking('')
      return
    }
    const rows = [
      ['Claim ID', 'Session Date', 'Amount', 'Claim Status', 'Insurer Status'],
      ...(data || []).map((row) => [row.claim_id, row.session_date, row.amount, row.claim_status, row.insurer_status]),
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `losslens-invoice-${invoice.invoice_period_end}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setWorking('')
  }

  const reportPayment = async (invoice) => {
    const ref = references[invoice.id]?.trim()
    if (!ref) {
      setError('Enter the M-Pesa or bank reference before reporting payment.')
      return
    }
    setWorking(invoice.id)
    setError('')
    const { error: paymentError } = await supabase.rpc('insurer_mark_invoice_paid', {
      p_invoice_id: invoice.id,
      p_ref: ref,
    })
    if (paymentError) {
      console.error('Invoice payment report failed:', paymentError)
      setError('Could not record this payment.')
    } else await load()
    setWorking('')
  }

  if (loading) return <p role="status">Loading invoices...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Insurer portal</p>
      <h2>Bulk invoices</h2>
      <p>Reporting a payment records its reference for super-admin verification. It does not replenish the claims float until confirmed.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {invoices.length === 0 ? <p>No invoices are available.</p> : (
        <div className="portal-list">
          {invoices.map((invoice) => (
            <article className="portal-card" key={invoice.id}>
              <div className="portal-page__heading">
                <div><strong>{invoice.invoice_period_start} – {invoice.invoice_period_end}</strong><p>{invoice.total_claims} claims · KES {Number(invoice.total_amount).toLocaleString()}</p></div>
                <span className={`portal-status portal-status--${invoice.status}`}>{invoice.status}</span>
              </div>
              {(invoice.payment_reference || invoice.mpesa_or_ach_ref) && <p>Payment reference: {invoice.payment_reference || invoice.mpesa_or_ach_ref}</p>}
              <div className="portal-form__actions">
                <button className="btn-ghost" disabled={working === invoice.id} onClick={() => exportInvoice(invoice)}>Download CSV</button>
                {invoice.status === 'sent' && (
                  <>
                    <input aria-label="Payment reference" maxLength={200} placeholder="M-Pesa or bank reference" value={references[invoice.id] || ''} onChange={(event) => setReferences((current) => ({ ...current, [invoice.id]: event.target.value }))} />
                    <button className="btn-primary" disabled={working === invoice.id} onClick={() => reportPayment(invoice)}>Report payment</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
