import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthProfile } from '../../context/AuthProfileContext'

export default function TherapistPayouts() {
  const { user } = useAuthProfile()
  const userId = user?.id
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error: fetchError } = await supabase.from('provider_payouts')
      .select('id, claim_id, amount, mpesa_ref, paid_at')
      .eq('therapist_id', userId)
      .order('paid_at', { ascending: false })
    if (fetchError) {
      console.error('Therapist payout load failed:', fetchError)
      setError('Could not load payout history.')
    } else {
      setPayouts(data || [])
      setError('')
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading) return <p role="status">Loading payouts...</p>
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Therapist portal</p>
      <h2>Payout history</h2>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {!error && payouts.length === 0 && <p>No payouts recorded yet.</p>}
      <div className="portal-list">
        {payouts.map((payout) => (
          <article className="portal-list__item" key={payout.id}>
            <div><strong>KES {Number(payout.amount).toLocaleString()}</strong><p>Claim {payout.claim_id}</p></div>
            <span>{payout.mpesa_ref || 'Reference pending'} · {new Date(payout.paid_at).toLocaleDateString()}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
