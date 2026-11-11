import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'

const cardStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }

export default function TherapistReferrals() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('provider_vouchers')
      .select('id, status, max_sessions, fee_per_session, expires_at, created_at')
      .eq('therapist_id', userId).in('status', ['assigned', 'accepted'])
      .order('created_at', { ascending: false })
    if (error) toast.error('Could not load referrals.')
    else setVouchers(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const respond = async (voucher, action) => {
    setWorking(voucher.id)
    const rpc = action === 'accept' ? 'therapist_accept_voucher' : 'therapist_decline_voucher'
    const { error } = await supabase.rpc(rpc, { p_voucher_id: voucher.id })
    if (error) toast.error(error.message || 'Could not update this referral.')
    else toast.success(action === 'accept' ? 'Referral accepted.' : 'Referral declined.')
    await load()
    setWorking('')
  }

  if (loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Therapist portal</p><h2>Referrals</h2></div>
      </header>
      <section style={cardStyle}>
        {vouchers.length === 0 ? <p>No referrals assigned to you.</p> : (
          <div className="portal-list">
            {vouchers.map((voucher) => (
              <article className="portal-list__item" key={voucher.id}>
                <div>
                  <strong>{voucher.status}</strong>
                  <p>{voucher.max_sessions} session{voucher.max_sessions === 1 ? '' : 's'} · KES {Number(voucher.fee_per_session).toLocaleString()} per session</p>
                  <small>Expires {new Date(voucher.expires_at).toLocaleDateString()}</small>
                </div>
                <div className="portal-list__actions">
                  {voucher.status === 'assigned' && (
                    <>
                      <button className="btn-primary" disabled={working === voucher.id} onClick={() => respond(voucher, 'accept')}>Accept</button>
                      <button className="btn-ghost" disabled={working === voucher.id} onClick={() => respond(voucher, 'decline')}>Decline</button>
                    </>
                  )}
                  {voucher.status === 'accepted' && <span className="portal-status portal-status--active">Accepted</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
