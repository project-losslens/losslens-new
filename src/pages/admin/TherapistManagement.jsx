import NumberField from '../../components/NumberField'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import UserAvatar from '../../components/UserAvatar'

export default function TherapistManagement() {
  const [therapists, setTherapists] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState('')
  const [voucherFees, setVoucherFees] = useState({})
  const [voucherAssignments, setVoucherAssignments] = useState({})
  const [paymentRefs, setPaymentRefs] = useState({})

  const load = useCallback(async () => {
    const [therapistResult, voucherResult, claimResult] = await Promise.all([
      supabase.rpc('admin_list_therapists'),
      supabase.from('provider_vouchers').select('id, pre_auth_voucher_id, status, created_at, expires_at').not('pre_auth_voucher_id', 'is', null).is('therapist_id', null).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('provider_claims').select('id, voucher_id, therapist_id, session_date, claim_amount, status, paid_at, insurer_reimbursed_at').order('created_at', { ascending: false }).limit(100),
    ])
    const failure = therapistResult.error || voucherResult.error || claimResult.error
    const therapistRows = therapistResult.data || []
    const profileIds = therapistRows.map((row) => row.id).filter(Boolean)
    const { data: profileRows } = profileIds.length
      ? await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', profileIds)
      : { data: [] }
    const profilesById = Object.fromEntries((profileRows || []).map((row) => [row.id, row]))
    if (failure) {
      console.error('Therapist management load failed:', failure)
      setError('Could not load therapist operations.')
    } else {
      setTherapists(therapistRows.map((row) => ({ ...row, profile: profilesById[row.id] || null })))
      setVouchers(voucherResult.data || [])
      setClaims(claimResult.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const changeStatus = async (therapistId, status) => {
    setWorking(therapistId)
    const { error: updateError } = await supabase.rpc('admin_set_therapist_status', {
      p_therapist_id: therapistId,
      p_status: status,
    })
    if (updateError) {
      console.error('Therapist verification update failed:', updateError)
      setError('Could not update therapist status.')
    } else await load()
    setWorking('')
  }

  const assignVoucher = async (voucherId) => {
    const therapistId = voucherAssignments[voucherId]
    if (!therapistId) {
      setError('Select an active therapist before assigning the voucher.')
      return
    }
    const fee = Number(voucherFees[voucherId])
    if (!Number.isFinite(fee) || fee <= 0) {
      setError('Enter an approved positive session fee before assigning the voucher.')
      return
    }
    setWorking(voucherId)
    const voucher = vouchers.find((item) => item.id === voucherId)
    if (!voucher?.pre_auth_voucher_id) {
      setError('This voucher is missing its pre-authorization link.')
      setWorking('')
      return
    }
    const { error: assignError } = await supabase.rpc('admin_assign_voucher_with_fee', {
      p_voucher_id: voucher.pre_auth_voucher_id,
      p_therapist_id: therapistId,
      p_fee_per_session: fee,
    })
    if (assignError) {
      console.error('Voucher assignment failed:', assignError)
      setError('Could not assign this voucher.')
    } else await load()
    setWorking('')
  }

  const approveClaim = async (claimId) => {
    setWorking(claimId)
    const { error: approvalError } = await supabase.rpc('admin_approve_claim', { p_claim_id: claimId })
    if (approvalError) {
      console.error('Therapist claim approval failed:', approvalError)
      setError('Could not approve this claim.')
    } else await load()
    setWorking('')
  }

  const voidVoucher = async (voucher) => {
    const reason = window.prompt('Reason for voiding this unclaimed voucher:')
    if (!reason?.trim()) return
    setWorking(voucher.id)
    const { error: voidError } = await supabase.rpc('void_voucher', {
      p_voucher_id: voucher.pre_auth_voucher_id,
      p_reason: reason.trim(),
    })
    if (voidError) {
      console.error('Voucher void failed:', voidError)
      setError('Could not void this voucher.')
    } else await load()
    setWorking('')
  }

  const payClaim = async (claim) => {
    const ref = paymentRefs[claim.voucher_id]?.trim()
    if (!ref) {
      setError('Enter an M-Pesa reference before paying claims.')
      return
    }
    setWorking(claim.voucher_id)
    const { error: paymentError } = await supabase.rpc('pay_therapist_float', {
      p_voucher_id: claim.voucher_id,
      p_mpesa_ref: ref,
    })
    if (paymentError) {
      console.error('Therapist float payment failed:', paymentError)
      setError('Could not pay approved claims. Check the float balance and claim status.')
    } else await load()
    setWorking('')
  }

  if (loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Admin operations</p>
      <h2>Therapist management</h2>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      <section className="portal-card">
        <h3>Therapists</h3>
        {therapists.length === 0 ? <p>No therapist profiles found.</p> : (
          <div className="portal-list">
            {therapists.map((therapist) => (
              <article className="portal-list__item" key={therapist.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <UserAvatar reference={therapist.profile?.avatar_url} name={therapist.profile?.full_name || therapist.profile?.username} size={36} />
                  <div>
                    <strong>{therapist.profile?.full_name || therapist.profile?.username || 'Therapist'}</strong>
                    <p>{therapist.specialty || 'Specialty not entered'} · License: {therapist.license_number || 'Not provided'}</p>
                    <small>{therapist.id}</small>
                  </div>
                </div>
                <div className="portal-list__actions">
                  <span className={`portal-status portal-status--${therapist.status}`}>{therapist.status}</span>
                  {therapist.status !== 'active' && <button className="btn-primary" disabled={working === therapist.id} onClick={() => changeStatus(therapist.id, 'active')}>Verify</button>}
                  {therapist.status === 'active' && <button className="btn-ghost" disabled={working === therapist.id} onClick={() => changeStatus(therapist.id, 'suspended')}>Suspend</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="portal-card">
        <h3>Unassigned vouchers</h3>
        {vouchers.length === 0 ? <p>No pending vouchers need assignment.</p> : (
          <div className="portal-list">
            {vouchers.map((voucher) => (
              <article className="portal-list__item" key={voucher.id}>
                <div><strong>Pending voucher</strong><p>Expires {new Date(voucher.expires_at).toLocaleDateString()}</p><small>{voucher.id}</small></div>
                <div className="portal-list__actions">
                  <label>Session fee (KES)<NumberField inputMode="decimal" min={0.01} step={0.01} prefix="KES" value={voucherFees[voucher.id] || ''} onChange={(fee) => setVoucherFees((current) => ({ ...current, [voucher.id]: fee ?? '' }))} /></label>
                  <select aria-label={`Assign voucher ${voucher.id}`} value={voucherAssignments[voucher.id] || ''} disabled={working === voucher.id} onChange={(event) => setVoucherAssignments((current) => ({ ...current, [voucher.id]: event.target.value }))}>
                    <option value="" disabled>Assign active therapist</option>
                    {therapists.filter((therapist) => therapist.status === 'active').map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.profile?.full_name || therapist.profile?.username || therapist.specialty || therapist.id}</option>)}
                  </select>
                  <button className="btn-primary" type="button" disabled={working === voucher.id} onClick={() => assignVoucher(voucher.id)}>Assign</button>
                  <button className="btn-ghost" type="button" disabled={working === voucher.id} onClick={() => voidVoucher(voucher)}>Void</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="portal-card">
        <h3>Therapist claims</h3>
        {claims.length === 0 ? <p>No therapist claims have been submitted.</p> : (
          <div className="portal-list">
            {claims.map((claim) => (
              <article className="portal-list__item" key={claim.id}>
                <div><strong>{claim.status} · KES {Number(claim.claim_amount).toLocaleString()}</strong><p>{claim.session_date} · Therapist {claim.therapist_id}</p><small>Claim {claim.id}</small></div>
                <div className="portal-list__actions">
                  {claim.status === 'submitted' && <button className="btn-primary" disabled={working === claim.id} onClick={() => approveClaim(claim.id)}>Approve</button>}
                  {claim.status === 'approved' && (
                    <>
                      <input aria-label={`M-Pesa reference for voucher ${claim.voucher_id}`} maxLength={200} placeholder="M-Pesa reference" value={paymentRefs[claim.voucher_id] || ''} onChange={(event) => setPaymentRefs((current) => ({ ...current, [claim.voucher_id]: event.target.value }))} />
                      <button className="btn-primary" disabled={working === claim.voucher_id} onClick={() => payClaim(claim)}>Pay voucher claims</button>
                    </>
                  )}
                  {claim.status === 'paid' && <span>{claim.insurer_reimbursed_at ? 'Paid by insurer' : 'Paid by LossLens — awaiting insurer reimbursement'}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
