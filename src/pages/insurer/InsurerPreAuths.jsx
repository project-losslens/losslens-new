import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'

//  Insurer portal — pre-authorisation inbox. Status data only; the
//  pre_auth_vouchers table carries no clinical content, and RLS limits
//  reads to the insurer's own rows.

const STATUS_COLOR = {
  pending: '#F2C879', assigned: '#7DBDEE', accepted: '#2DD4BF',
  completed: '#2DD4BF', expired: 'rgba(255,255,255,0.4)', void: '#ff9b9b',
}

export default function InsurerPreAuths() {
  const { user } = useAuthProfile()
  const [insurer, setInsurer] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data: ins } = await supabase.from('insurers').select('id, name').eq('profile_id', user.id).maybeSingle()
    if (!ins) { setError('No insurer organisation is linked to this account.'); setLoading(false); return }
    setInsurer(ins)
    const { data, error: qErr } = await supabase
      .from('pre_auth_vouchers')
      .select('id, user_id, status, max_sessions, expires_at, created_at')
      .eq('insurer_id', ins.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (qErr) setError('Could not load pre-authorisations.')
    else setRows(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { void load() }, [load])

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
        {rows.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <p style={{ color: '#FFFFFF', fontSize: '13px', margin: 0 }}>{r.max_sessions} session(s) requested</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>Expires {new Date(r.expires_at).toLocaleDateString()} · {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <span style={{ color: STATUS_COLOR[r.status] || '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{r.status}</span>
          </div>
        ))}
      </section>
    </section>
  )
}
