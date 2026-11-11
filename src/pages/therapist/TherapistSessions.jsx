import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'

const cardStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }

export default function TherapistSessions() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [vouchers, setVouchers] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    const [voucherResult, claimResult] = await Promise.all([
      supabase.from('provider_vouchers').select('id, pre_auth_voucher_id, status, max_sessions, fee_per_session')
        .eq('therapist_id', userId).eq('status', 'accepted').order('created_at', { ascending: false }),
      supabase.from('provider_claims').select('id, voucher_id, session_date, claim_amount, status')
        .eq('therapist_id', userId).order('session_date', { ascending: false }),
    ])
    if (voucherResult.error || claimResult.error) toast.error('Could not load sessions.')
    else {
      setVouchers(voucherResult.data || [])
      setClaims(claimResult.data || [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  if (loading) return <BrandLoader variant="section" />
  const claimsByVoucher = {}
  for (const claim of claims) {
    claimsByVoucher[claim.voucher_id] = (claimsByVoucher[claim.voucher_id] || 0) + 1
  }
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Therapist portal</p><h2>Sessions</h2></div>
      </header>
      <section style={cardStyle}>
        {vouchers.length === 0 ? <p>No active session vouchers.</p> : (
          <div className="portal-list">
            {vouchers.map((voucher) => {
              const done = claimsByVoucher[voucher.id] || 0
              return (
                <article className="portal-list__item" key={voucher.id}>
                  <div>
                    <strong>{done} of {voucher.max_sessions} sessions completed</strong>
                    <p>KES {Number(voucher.fee_per_session).toLocaleString()} per session</p>
                  </div>
                  <div className="portal-list__actions">
                    {done < voucher.max_sessions && voucher.pre_auth_voucher_id && (
                      <Link className="btn-primary" to={`/therapist/claims/new?voucher=${encodeURIComponent(voucher.pre_auth_voucher_id)}`}>Log session</Link>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <section style={cardStyle}>
        <h3>Completed sessions</h3>
        {claims.length === 0 ? <p>No sessions logged yet.</p> : (
          <div className="portal-list">
            {claims.map((claim) => (
              <article className="portal-list__item" key={claim.id}>
                <div><strong>{new Date(claim.session_date).toLocaleDateString()}</strong><p>KES {Number(claim.claim_amount).toLocaleString()} · {claim.status}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
