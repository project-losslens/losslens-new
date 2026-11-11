import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import AppIcon from '../../components/AppIcon'
import { toCsv, downloadCsv } from '../../lib/csv'

//  Insurer portal — Protection members: roster upload + membership
//  verification. Only whitelisted columns are read; clinical data is never
//  exposed to insurer sessions (RLS + RPCs enforce this server-side).

const STATUS_COLOR = {
  pending_verification: '#F2C879',
  active: '#2DD4BF',
  suspended: '#7DBDEE',
  ended: 'rgba(255,255,255,0.4)',
  rejected: '#ff9b9b',
}

export default function InsurerMembers() {
  const { user } = useAuthProfile()
  const [insurer, setInsurer] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [csvRows, setCsvRows] = useState(null)
  const [report, setReport] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [verifyRef, setVerifyRef] = useState({})

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data: ins } = await supabase.from('insurers').select('id, name').eq('profile_id', user.id).maybeSingle()
    if (!ins) { setError('No insurer organisation is linked to this account.'); setLoading(false); return }
    setInsurer(ins)
    const [{ data: mems, error: memErr }, { data: pls }] = await Promise.all([
      supabase.from('protection_memberships').select('id, user_id, member_reference, status, created_at, verified_at')
        .eq('insurer_id', ins.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('protection_plans').select('id, name, code').eq('insurer_id', ins.id),
    ])
    if (memErr) setError('Could not load members.')
    else setMemberships(mems || [])
    setPlans(pls || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void load() }, [load])

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return []
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const refIdx = header.findIndex(h => h.includes('reference') || h.includes('member'))
    const emailIdx = header.findIndex(h => h.includes('email'))
    const rows = []
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(c => c.trim())
      rows.push({ member_reference: cols[refIdx] || '', email: cols[emailIdx] || '' })
    }
    return rows.filter(r => r.member_reference || r.email)
  }

  const onCsvFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseCsv(text)
    setCsvRows(rows)
    setReport(null)
  }

  const uploadRoster = async () => {
    if (!csvRows?.length || !insurer) return
    setUploading(true)
    const { data, error: rpcError } = await supabase.rpc('insurer_upload_member_roster', {
      p_insurer_id: insurer.id,
      p_rows: csvRows,
    })
    setUploading(false)
    if (rpcError) { toast.error(rpcError.message || 'Roster upload failed.'); return }
    setReport(data)
    toast.success(`Roster received: ${data?.received ?? csvRows.length} rows.`)
    setCsvRows(null)
  }

  const exportCsv = () => {
    const rows = memberships.map(m => ({
      member_reference: m.member_reference || '',
      status: m.status,
      created_at: m.created_at,
      verified_at: m.verified_at || '',
    }))
    downloadCsv('losslens-protection-members.csv', toCsv(rows, [
      { key: 'member_reference', label: 'Member reference' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Enrolled at' },
      { key: 'verified_at', label: 'Verified at' },
    ]))
    toast.success('Members exported.')
  }

  const verify = async (m) => {
    const ref = verifyRef[m.id] ?? m.member_reference ?? ''
    const { error: rpcError } = await supabase.rpc('insurer_verify_membership', {
      p_membership_id: m.id,
      p_member_reference: ref || null,
    })
    if (rpcError) { toast.error(rpcError.message || 'Verification failed.'); return }
    toast.success('Membership verified.')
    setMemberships(prev => prev.map(x => x.id === m.id ? { ...x, status: 'active', verified_at: new Date().toISOString() } : x))
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Protection members</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}

      <section className="portal-card">
        <h3>Upload member roster (CSV)</h3>
        <p className="portal-notice">Columns: member_reference, email. Max 5,000 rows. Uploads are logged; memberships still require verification.</p>
        <input type="file" accept=".csv,text/csv" onChange={onCsvFile} aria-label="Roster CSV file" />
        {csvRows && (
          <div style={{ marginTop: '10px' }}>
            <p>{csvRows.length} rows parsed.</p>
            <button type="button" className="btn-primary" onClick={uploadRoster} disabled={uploading}>
              {uploading ? <BrandLoader variant="inline" showWordmark={false} /> : 'Upload roster'}
            </button>
          </div>
        )}
        {report && <p className="portal-notice">Received {report.received} rows.</p>}
      </section>

      <section className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>Memberships ({memberships.length})</h3>
          {memberships.length > 0 && <button type="button" className="btn-ghost fs-12" onClick={exportCsv}>Export CSV</button>}
        </div>
        {memberships.length === 0 && <p className="portal-notice">No Protection memberships yet.</p>}
        {memberships.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>{m.member_reference || 'No reference'}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{new Date(m.created_at).toLocaleDateString()}</p>
            </div>
            <span style={{ color: STATUS_COLOR[m.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{m.status.replace(/_/g, ' ')}</span>
            {m.status === 'pending_verification' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={verifyRef[m.id] ?? m.member_reference ?? ''}
                  onChange={e => setVerifyRef(prev => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="Member ref"
                  style={{ width: '110px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '12px' }}
                />
                <button type="button" className="btn-primary fs-11" style={{ padding: '6px 10px', minHeight: '32px' }} onClick={() => verify(m)}>
                  <AppIcon name="check" size={12} /> Verify
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </section>
  )
}
