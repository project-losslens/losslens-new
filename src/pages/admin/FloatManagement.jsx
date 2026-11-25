import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import { DirectPaymentTracking } from '../insurer/InsurerInvoices'

export default function FloatManagement() {
  const [transactions,setTransactions]=useState([])
  const [invoices,setInvoices]=useState([])
  const [balance,setBalance]=useState(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{
    const [ledger,history,float]=await Promise.all([
      supabase.from('claims_float_transactions').select('id,type,amount,note,created_at').order('created_at',{ascending:false}).limit(200),
      supabase.from('bulk_invoices').select('id,total_amount,status,payment_reference,paid_at').order('created_at',{ascending:false}).limit(200),
      supabase.from('claims_float').select('balance').eq('id',1).maybeSingle(),
    ])
    if(ledger.error||history.error||float.error)setError('Could not load historical finance records. Check super-admin access and retry.')
    else{setTransactions(ledger.data||[]);setInvoices(history.data||[]);setBalance(float.data?.balance??null);setError('')}
    setLoading(false)
  },[])
  useEffect(()=>{const timer=setTimeout(()=>{void load()},0);return()=>clearTimeout(timer)},[load])
  if(loading)return <BrandLoader variant="section" />
  return <section className="portal-page"><h2>Direct payments and historical finance</h2><p>Insurers pay therapists directly outside LossLens. Historical float and bulk-invoice records are read only; they do not represent new direct payments. Platform subscription payments remain separate.</p><DirectPaymentTracking readOnly />
    {error&&<p role="alert" className="portal-error">{error} <button type="button" onClick={load}>Retry</button></p>}
    <details className="portal-card"><summary>Historical float ledger</summary><p>Recorded legacy balance: {balance==null?'Unavailable':`KES ${Number(balance).toLocaleString()}`}</p>{transactions.map(row=><p key={row.id}>{row.type} · KES {Number(row.amount).toLocaleString()} · {row.note} · {new Date(row.created_at).toLocaleString()}</p>)}</details>
    <details className="portal-card"><summary>Historical bulk invoices</summary>{invoices.map(row=><p key={row.id}>Invoice {row.id} · KES {Number(row.total_amount).toLocaleString()} · {row.status} · {row.payment_reference||'No reference'}</p>)}</details>
  </section>
}