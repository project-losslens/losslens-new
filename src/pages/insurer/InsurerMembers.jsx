import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import AppIcon from '../../components/AppIcon'
import NumberField from '../../components/NumberField'
import { toCsv, downloadCsv } from '../../lib/csv'

//  Insurer portal — Protection policyholders: roster upload, membership
//  verification, policy issuance. All reads via whitelisted RPCs/views;
//  no user ids or clinical data are exposed to the insurer session.

const STATUS_COLOR = {
  pending_verification: '#F2C879', active: '#2DD4BF', suspended: '#7DBDEE',
  ended: 'rgba(255,255,255,0.4)', rejected: '#ff9b9b',
}
const POLICY_STATUS_COLOR = {
  issued: '#F2C879', pending_payment: '#F2C879', active: '#2DD4BF',
  grace: '#7DBDEE', lapsed: '#ff9b9b', cancelled: 'rgba(255,255,255,0.4)', expired: 'rgba(255,255,255,0.4)',
}

export default function InsurerMembers() {
  const [insurer, setInsurer] = useState(null)
  const [rows, setRows] = useState([])
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [csvRows, setCsvRows] = useState(null)
  const [report, setReport] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [verifyRef, setVerifyRef] = useState({})
  const [issueForm, setIssueForm] = useState({}) // membership_id -> {version_id, policy_number, commencement, expiry, premium}
  const [premiumForm, setPremiumForm] = useState({}) // policy_id -> {period_start, period_end, amount_due, amount_received, payment_ref, channel}
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    const { data: ins } = await supabase.from('insurers').select('id, name').eq('profile_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle()
    if (!ins) { setError('No insurer organisation is linked to this account.'); setLoading(false); return }
    setInsurer(ins)
    const [holders, vers] = await Promise.all([
      supabase.rpc('insurer_list_policyholders'),
      supabase.from('protection_plan_versions').select('id, plan_id, version_no, status, premium_amount, premium_frequency')
        .eq('insurer_id', ins.id).eq('status', 'approved'),
    ])
    if (holders.error) setError('Could not load policyholders.')
    else setRows(holders.data || [])
    setVersions(vers.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return []
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const refIdx = header.findIndex(h => h.includes('reference') || h.includes('member'))
    const emailIdx = header.findIndex(h => h.includes('email'))
    const out = []
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(c => c.trim())
      out.push({ member_reference: cols[refIdx] || '', email: cols[emailIdx] || '' })
    }
    return out.filter(r => r.member_reference || r.email)
  }

  const onCsvFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvRows(parseCsv(await file.text()))
    setReport(null)
  }

  const uploadRoster = async () => {
    if (!csvRows?.length || !insurer) return
    setUploading(true)
    const { data, error: rpcError } = await supabase.rpc('insurer_upload_member_roster', {
      p_insurer_id: insurer.id, p_rows: csvRows,
    })
    setUploading(false)
    if (rpcError) { toast.error(rpcError.message || 'Roster upload failed.'); return }
    setReport(data)
    toast.success(`Roster processed: ${data?.received ?? 0} rows.`)
    setCsvRows(null)
    await load()
  }

  const verify = async (m) => {
    const ref = verifyRef[m.membership_id] ?? m.member_reference ?? ''
    const { error: rpcError } = await supabase.rpc('insurer_verify_membership', {
      p_membership_id: m.membership_id, p_member_reference: ref || null,
    })
    if (rpcError) { toast.error(rpcError.message || 'Verification failed.'); return }
    toast.success('Membership verified.')
    await load()
  }

  const issuePolicy = async (m) => {
    const f = issueForm[m.membership_id] || {}
    if (!f.version_id || !f.policy_number?.trim()) {
      toast.error('Select a product version and enter the insurer policy number.'); return
    }
    setWorking(m.membership_id)
    const { error: rpcError } = await supabase.rpc('insurer_issue_policy', {
      p_membership_id: m.membership_id,
      p_plan_version_id: f.version_id,
      p_policy_number: f.policy_number.trim(),
      p_commencement_date: f.commencement || null,
      p_expiry_date: f.expiry || null,
      p_premium_amount: f.premium ? Number(f.premium) : null,
    })
    setWorking('')
    if (rpcError) { toast.error(rpcError.message || 'Policy issuance failed.'); return }
    toast.success('Policy issued.')
    await load()
  }

  const recordPremium = async (policyId) => {
    const f = premiumForm[policyId] || {}
    if (!f.period_start || !f.period_end || f.amount_due === '' || f.amount_received === '') {
      toast.error('Period and amounts are required.'); return
    }
    setWorking(policyId)
    const { error: rpcError } = await supabase.rpc('insurer_record_premium', {
      p_policy_id: policyId,
      p_period_start: f.period_start,
      p_period_end: f.period_end,
      p_amount_due: Number(f.amount_due),
      p_amount_received: Number(f.amount_received),
      p_payment_ref: f.payment_ref || null,
      p_channel: f.channel || null,
    })
    setWorking('')
    if (rpcError) { toast.error(rpcError.message || 'Premium record failed.'); return }
    toast.success('Premium recorded — policy status updated.')
    await load()
  }

  const exportCsv = () => {
    const out = rows.map(r => ({
      member_reference: r.member_reference || '', membership_status: r.membership_status,
      policy_number: r.policy_number || '', policy_status: r.policy_status || '',
      premium_status: r.premium_status || '', commencement_date: r.commencement_date || '',
      expiry_date: r.expiry_date || '', product: r.product_name || '',
    }))
    downloadCsv('losslens-protection-policyholders.csv', toCsv(out, [
      { key: 'member_reference', label: 'Member reference' },
      { key: 'membership_status', label: 'Membership status' },
      { key: 'policy_number', label: 'Policy number' },
      { key: 'policy_status', label: 'Policy status' },
      { key: 'premium_status', label: 'Premium status' },
      { key: 'commencement_date', label: 'Commencement' },
      { key: 'expiry_date', label: 'Expiry' },
      { key: 'product', label: 'Product' },
    ]))
    toast.success('Policyholders exported.')
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Protection policyholders</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}

      <section className="portal-card">
        <h3>Upload member roster (CSV)</h3>
        <p className="portal-notice">Columns: member_reference, email. Max 5,000 rows. Rows are matched to memberships by reference; issuance is still manual.</p>
        <input type="file" accept=".csv,text/csv" onChange={onCsvFile} aria-label="Roster CSV file" />
        {csvRows && (
          <div style={{ marginTop: '10px' }}>
            <p>{csvRows.length} rows parsed.</p>
            <button type="button" className="btn-primary" onClick={uploadRoster} disabled={uploading}>
              {uploading ? <BrandLoader variant="inline" showWordmark={false} /> : 'Upload roster'}
            </button>
          </div>
        )}
        {report && <p className="portal-notice">Received {report.received} · matched {report.matched} · unmatched {report.unmatched} · rejected {report.rejected}.</p>}
      </section>

      <section className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>Policyholders ({rows.length})</h3>
          {rows.length > 0 && <button type="button" className="btn-ghost fs-12" onClick={exportCsv}>Export CSV</button>}
        </div>
        {rows.length === 0 && !error && <p className="portal-notice">No Protection memberships yet.</p>}
        {rows.map(m => {
          const f = issueForm[m.membership_id] || {}
          const canIssue = m.membership_status === 'active' && !m.policy_id && versions.length > 0
          return (
            <div key={m.membership_id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>{m.member_reference || 'No reference'}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                    {m.policy_number ? `${m.policy_number} · ${m.product_name || ''}` : 'No policy yet'}
                  </p>
                </div>
                <span style={{ color: STATUS_COLOR[m.membership_status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{m.membership_status.replace(/_/g, ' ')}</span>
                {m.policy_status && (
                  <span style={{ color: POLICY_STATUS_COLOR[m.policy_status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                    {m.policy_status.replace(/_/g, ' ')}{m.premium_status ? ` · ${m.premium_status.replace(/_/g, ' ')}` : ''}
                  </span>
                )}
                {m.membership_status === 'pending_verification' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="text" value={verifyRef[m.membership_id] ?? m.member_reference ?? ''}
                      onChange={e => setVerifyRef(p => ({ ...p, [m.membership_id]: e.target.value }))}
                      placeholder="Member ref"
                      style={{ width: '110px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }} />
                    <button type="button" className="btn-primary fs-11" style={{ padding: '6px 10px', minHeight: '32px' }} onClick={() => verify(m)}>
                      <AppIcon name="check" size={12} /> Verify
                    </button>
                  </div>
                )}
              </div>
              {canIssue && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Product version
                    <select value={f.version_id || ''} onChange={e => setIssueForm(p => ({ ...p, [m.membership_id]: { ...f, version_id: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', background: '#0B1220', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '6px 8px' }}>
                      <option value="">Select…</option>
                      {versions.map(v => <option key={v.id} value={v.id}>v{v.version_no} · {v.premium_frequency} · KES {Number(v.premium_amount || 0).toLocaleString()}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Policy number
                    <input value={f.policy_number || ''} onChange={e => setIssueForm(p => ({ ...p, [m.membership_id]: { ...f, policy_number: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px', width: '150px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Commencement
                    <input type="date" value={f.commencement || ''} onChange={e => setIssueForm(p => ({ ...p, [m.membership_id]: { ...f, commencement: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Expiry
                    <input type="date" value={f.expiry || ''} onChange={e => setIssueForm(p => ({ ...p, [m.membership_id]: { ...f, expiry: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Premium (KES)
                    <NumberField value={f.premium ?? ''} onChange={v => setIssueForm(p => ({ ...p, [m.membership_id]: { ...f, premium: v } }))} min={0} />
                  </label>
                  <button type="button" className="btn-primary fs-11" style={{ padding: '6px 12px', minHeight: '32px' }} disabled={working === m.membership_id} onClick={() => issuePolicy(m)}>
                    {working === m.membership_id ? 'Issuing…' : 'Issue policy'}
                  </button>
                </div>
              )}
              {m.policy_id && ['issued', 'pending_payment', 'active', 'grace'].includes(m.policy_status) && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Period start
                    <input type="date" value={premiumForm[m.policy_id]?.period_start || ''}
                      onChange={e => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], period_start: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Period end
                    <input type="date" value={premiumForm[m.policy_id]?.period_end || ''}
                      onChange={e => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], period_end: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Due (KES)
                    <NumberField value={premiumForm[m.policy_id]?.amount_due ?? ''} onChange={v => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], amount_due: v } }))} min={0} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Received (KES)
                    <NumberField value={premiumForm[m.policy_id]?.amount_received ?? ''} onChange={v => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], amount_received: v } }))} min={0} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Payment ref
                    <input value={premiumForm[m.policy_id]?.payment_ref || ''}
                      onChange={e => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], payment_ref: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px', width: '110px' }} />
                  </label>
                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Channel
                    <input value={premiumForm[m.policy_id]?.channel || ''} placeholder="mpesa/bank"
                      onChange={e => setPremiumForm(p => ({ ...p, [m.policy_id]: { ...p[m.policy_id], channel: e.target.value } }))}
                      style={{ display: 'block', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px', width: '90px' }} />
                  </label>
                  <button type="button" className="btn-primary fs-11" style={{ padding: '6px 12px', minHeight: '32px' }} disabled={working === m.policy_id} onClick={() => recordPremium(m.policy_id)}>
                    {working === m.policy_id ? 'Saving…' : 'Record premium'}
                  </button>
                </div>
              )}
              {versions.length === 0 && m.membership_status === 'active' && !m.policy_id && (
                <p className="portal-notice" style={{ marginTop: '8px' }}>No approved product versions — create and submit one under Protection plans first.</p>
              )}
            </div>
          )
        })}
      </section>
      <p className="portal-notice">Members are identified by member reference and policy number only. Clinical and recovery data are never visible here.</p>
    </section>
  )
}
