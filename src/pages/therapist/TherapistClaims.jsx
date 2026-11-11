import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'

const cardStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }

export default function TherapistClaims() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('provider_claims')
      .select('id, voucher_id, session_date, claim_amount, status, paid_at, insurer_reimbursed_at, created_at')
      .eq('therapist_id', userId).order('created_at', { ascending: false })
    if (error) toast.error('Could not load claims.')
    else setClaims(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  if (loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Therapist portal</p><h2>Claims</h2></div>
        <Link className="btn-primary" to="/therapist/claims/new">New claim</Link>
      </header>
      <section style={cardStyle}>
        {claims.length === 0 ? <p>No claims submitted.</p> : (
          <div className="portal-list">
            {claims.map((claim) => (
              <article className="portal-list__item" key={claim.id}>
                <div>
                  <strong>{claim.status} · KES {Number(claim.claim_amount).toLocaleString()}</strong>
                  <p>Session {new Date(claim.session_date).toLocaleDateString()} · submitted {new Date(claim.created_at).toLocaleDateString()}</p>
                  {claim.paid_at && <small>Paid {new Date(claim.paid_at).toLocaleDateString()}{claim.insurer_reimbursed_at ? ' · reimbursed by insurer' : ' · awaiting insurer reimbursement'}</small>}
                </div>
                <span className={`portal-status portal-status--${claim.status === 'paid' ? 'active' : claim.status === 'rejected' ? 'suspended' : 'pending'}`}>{claim.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
