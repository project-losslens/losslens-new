import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import NumberField from '../../components/NumberField'

//  Insurer portal — Protection pre-authorisation inbox. Reads go through
//  insurer_list_preauths (whitelisted; no crisis/user ids). Decisions via
//  insurer_decide_preauth RPC — recorded with actor, timestamp, reason.

const STATUS_COLOR = {
  pending: '#F2C879', assigned: '#7DBDEE', accepted: '#2DD4BF',
  completed: '#2DD4BF', expired: 'rgba(255,255,255,0.4)', void: '#ff9b9b',
}

export default function InsurerPreAuths() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decisions, setDecisions] = useState({}) // id -> {decision, fee, reason}
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('insurer_list_preauths')
    if (rpcError) {
      setError(rpcError.message || 'Could not load pre-authorisations.')
    } else {
      setRows(data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const decide = async (row) => {
    const d = decisions[row.preauth_id] || {}
    const decision = d.decision || 'approved'
    if (decision === 'rejected' && !d.reason?.trim()) {
      toast.error('Enter a rejection reason.'); return
    }
    setWorking(row.preauth_id)
    const { error: rpcError } = await supabase.rpc('insurer_decide_preauth', {
      p_preauth_id: row.preauth_id,
      p_decision: decision,
      p_reason: d.reason?.trim() || null,
      p_fee: decision === 'rejected' ? null : (Number(d.fee) || null),
    })
    setWorking('')
    if (rpcError) { toast.error(rpcError.message || 'Decision failed.'); return }
    toast.success(`Pre-authorisation ${decision.replace(/_/g, ' ')}.`)
    await load()
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Insurer portal</p><h2>Pre-authorisations</h2></div>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}
      <section className="portal-card">
        <h3>Requests ({rows.length})</h3>
        {rows.length === 0 && !error && <p className="portal-notice">No pre-authorisation requests for your organisation.</p>}
        {rows.map(r => {
          const d = decisions[r.preauth_id] || {}
          const awaitDecision = r.status === 'pending' && !r.insurer_decision
          return (
            <div key={r.preauth_id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>
                    {r.member_reference} · {r.max_sessions} session(s)
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                    Requested {new Date(r.created_at).toLocaleDateString()}
                    {r.expires_at ? ` · expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span style={{ color: STATUS_COLOR[r.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{r.status}</span>
                {r.insurer_decision && (
                  <span style={{ color: '#7DBDEE', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                    {r.insurer_decision.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              {awaitDecision && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                      Decision
                      <select value={d.decision || 'approved'} onChange={e => setDecisions(p => ({ ...p, [r.preauth_id]: { ...d, decision: e.target.value } }))}
                        style={{ display: 'block', marginTop: '4px', background: '#0B1220', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '6px 8px' }}>
                        <option value="approved">Approve</option>
                        <option value="partially_approved">Partially approve</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </label>
                    {d.decision !== 'rejected' && (
                      <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                        Authorised fee per session (KES)
                        <NumberField value={d.fee ?? ''} onChange={v => setDecisions(p => ({ ...p, [r.preauth_id]: { ...d, fee: v } }))} min={0} />
                      </label>
                    )}
                  </div>
                  <input
                    type="text" maxLength={1000}
                    placeholder={d.decision === 'rejected' ? 'Rejection reason (required)' : 'Reason / notes (optional)'}
                    value={d.reason || ''}
                    onChange={e => setDecisions(p => ({ ...p, [r.preauth_id]: { ...d, reason: e.target.value } }))}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: '#0B1220', color: '#fff', fontSize: '13px' }}
                  />
                  <div>
                    <button type="button" className="btn-primary fs-12" disabled={working === r.preauth_id} onClick={() => decide(r)}>
                      {working === r.preauth_id ? 'Saving…' : 'Record decision'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>
      <p className="portal-notice">Decisions are recorded with your identity and timestamp. Approved fees cap what providers may claim for this authorisation.</p>
    </section>
  )
}
