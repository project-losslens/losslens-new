import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'

const cardStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }

export default function TherapistDashboard() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [therapist, setTherapist] = useState(null)
  const [vouchers, setVouchers] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const [therapistResult, voucherResult, claimResult] = await Promise.all([
      supabase.rpc('therapist_get_self_profile'),
      supabase.from('provider_vouchers').select('id, pre_auth_voucher_id, status, max_sessions, fee_per_session, expires_at, created_at')
        .eq('therapist_id', userId).order('created_at', { ascending: false }),
      supabase.from('provider_claims').select('id, voucher_id, session_date, claim_amount, status, paid_at, insurer_reimbursed_at')
        .eq('therapist_id', userId).order('created_at', { ascending: false }),
    ])
    setError('')
    const failure = therapistResult.error || voucherResult.error || claimResult.error
    if (failure) {
      console.error('Therapist dashboard load failed:', failure)
      setError('Could not load your therapist dashboard. Please retry.')
    } else {
      setTherapist(therapistResult.data)
      setVouchers(voucherResult.data || [])
      setClaims(claimResult.data || [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const acceptVoucher = async (voucherId) => {
    setWorking(voucherId)
    const { error: acceptError } = await supabase.rpc('therapist_accept_voucher', { p_voucher_id: voucherId })
    if (acceptError) {
      console.error('Voucher acceptance failed:', acceptError)
      setError('Could not accept this voucher. It may have expired or been assigned elsewhere.')
    } else {
      await load()
    }
    setWorking('')
  }

  if (loading) return <p role="status">Loading therapist dashboard...</p>
  if (error) return <section role="alert" style={cardStyle}><p>{error}</p><button className="btn-primary" onClick={load}>Retry</button></section>

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Therapist portal</p><h2>Welcome back</h2></div>
        <span className={`portal-status portal-status--${therapist?.status || 'pending'}`}>{therapist?.status || 'pending verification'}</span>
      </header>
      {therapist?.status !== 'active' && (
        <div role="status" className="portal-notice">
          Your therapist account is awaiting verification. Complete your <Link to="/therapist/onboarding">profile and license details</Link>.
        </div>
      )}
      <div className="portal-stats">
        <article style={cardStyle}><span>Assigned vouchers</span><strong>{vouchers.length}</strong></article>
        <article style={cardStyle}><span>Claims submitted</span><strong>{claims.length}</strong></article>
        <article style={cardStyle}><span>Pending claims</span><strong>{claims.filter((claim) => claim.status === 'submitted').length}</strong></article>
      </div>
      <section style={cardStyle}>
        <h3>Vouchers</h3>
        {vouchers.length === 0 ? <p>No vouchers have been assigned yet.</p> : (
          <div className="portal-list">
            {vouchers.map((voucher) => (
              <article className="portal-list__item" key={voucher.id}>
                <div><strong>{voucher.status}</strong><p>{voucher.max_sessions} sessions · KES {Number(voucher.fee_per_session).toLocaleString()} per session</p><small>Expires {new Date(voucher.expires_at).toLocaleDateString()}</small></div>
                <div className="portal-list__actions">
                  {voucher.status === 'assigned' && <button className="btn-primary" disabled={working === voucher.id || therapist?.status !== 'active'} onClick={() => acceptVoucher(voucher.id)}>{working === voucher.id ? 'Accepting...' : 'Accept'}</button>}
                  {voucher.status === 'accepted' && voucher.pre_auth_voucher_id && <Link className="btn-primary" to={`/therapist/claims/new?voucher=${encodeURIComponent(voucher.pre_auth_voucher_id)}`}>Submit session claim</Link>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section style={cardStyle}>
        <h3>Recent claims</h3>
        {claims.length === 0 ? <p>No claims submitted.</p> : (
          <div className="portal-list">
            {claims.slice(0, 10).map((claim) => (
              <article className="portal-list__item" key={claim.id}>
                <div><strong>{claim.status}</strong><p>{new Date(claim.session_date).toLocaleDateString()} · KES {Number(claim.claim_amount).toLocaleString()}</p></div>
                <span>{claim.status === 'paid' ? (claim.insurer_reimbursed_at ? 'Paid by insurer' : 'Paid by LossLens — awaiting insurer reimbursement') : ''}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
