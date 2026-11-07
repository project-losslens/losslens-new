import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function InsurerManagement() {
  const [insurers, setInsurers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [partnerships, setPartnerships] = useState([])
  const [form, setForm] = useState({ profile_id: '', name: '', license_number: '', contact_email: '', contact_phone: '' })
  const [partnership, setPartnership] = useState({ insurer_id: '', b2b_client_id: '', cohort_name: '', per_member_fee: '', contract_start: '', contract_end: '' })
  const [invoiceForm, setInvoiceForm] = useState({ insurer_id: '', period_start: '', period_end: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const [insurerResult, profileResult, clientResult, partnershipResult] = await Promise.all([
      supabase.from('insurers').select('id, profile_id, name, license_number, contact_email, contact_phone, status, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'insurer').order('created_at', { ascending: false }),
      supabase.from('b2b_clients').select('id, company_name').order('company_name'),
      supabase.from('insurer_partnerships').select('id, insurer_id, b2b_client_id, cohort_name, per_member_fee, status').order('created_at', { ascending: false }),
    ])
    const failure = insurerResult.error || profileResult.error || clientResult.error || partnershipResult.error
    if (failure) {
      console.error('Insurer management load failed:', failure)
      setError('Could not load insurer accounts.')
    } else {
      setInsurers(insurerResult.data || [])
      setProfiles(profileResult.data || [])
      setClients(clientResult.data || [])
      setPartnerships(partnershipResult.data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { error: saveError } = await supabase.from('insurers').insert({
      profile_id: form.profile_id,
      name: form.name.trim(),
      license_number: form.license_number.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    })
    if (saveError) {
      console.error('Insurer account creation failed:', saveError)
      setError('Could not associate this insurer. Confirm the selected account is not already linked.')
    } else {
      setForm({ profile_id: '', name: '', license_number: '', contact_email: '', contact_phone: '' })
      await load()
    }
    setSaving(false)
  }

  const setStatus = async (insurer, status) => {
    const { error: updateError } = await supabase.from('insurers').update({ status }).eq('id', insurer.id)
    if (updateError) {
      console.error('Insurer status update failed:', updateError)
      setError('Could not update insurer status.')
    } else await load()
  }

  const inviteInsurer = async (event) => {
    event.preventDefault()
    setInviting(true)
    setError('')
    setNotice('')
    try {
      const { data, error: inviteError } = await supabase.functions.invoke('send-invite', {
        body: { action: 'invite', email: inviteEmail.trim(), role: 'insurer' },
      })
      if (inviteError || data?.error) {
        console.error('Insurer invitation failed:', inviteError || data?.error)
        setError('Could not send the insurer invitation.')
      } else {
        setInviteEmail('')
        setNotice('Invitation sent. The insurer account can be linked after the user accepts.')
        await load()
      }
    } catch (inviteError) {
      console.error('Insurer invitation request failed:', inviteError)
      setError('Could not send the insurer invitation.')
    } finally {
      setInviting(false)
    }
  }

  const createPartnership = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { error: partnershipError } = await supabase.from('insurer_partnerships').insert({
      insurer_id: partnership.insurer_id,
      b2b_client_id: partnership.b2b_client_id,
      cohort_name: partnership.cohort_name.trim(),
      per_member_fee: Number(partnership.per_member_fee),
      contract_start: partnership.contract_start || null,
      contract_end: partnership.contract_end || null,
    })
    if (partnershipError) {
      console.error('Insurer partnership creation failed:', partnershipError)
      setError('Could not create this insurer partnership.')
    } else {
      setPartnership({ insurer_id: '', b2b_client_id: '', cohort_name: '', per_member_fee: '', contract_start: '', contract_end: '' })
      await load()
    }
    setSaving(false)
  }

  const generateInvoice = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { data: invoiceId, error: createError } = await supabase.rpc('insurer_generate_bulk_invoice', {
      p_insurer_id: invoiceForm.insurer_id,
      p_period_start: invoiceForm.period_start,
      p_period_end: invoiceForm.period_end,
    })
    if (createError) {
      console.error('Insurer invoice generation failed:', createError)
      setError('Could not generate an invoice for the selected period.')
      setSaving(false)
      return
    }
    const { error: sendError } = await supabase.rpc('insurer_send_bulk_invoice', { p_invoice_id: invoiceId })
    if (sendError) {
      console.error('Insurer invoice dispatch failed:', sendError)
      setError('The invoice draft was created but could not be sent. Review it before retrying.')
    } else {
      setInvoiceForm({ insurer_id: '', period_start: '', period_end: '' })
      await load()
    }
    setSaving(false)
  }

  if (loading) return <p role="status">Loading insurer accounts...</p>
  const linkedProfileIds = new Set(insurers.map((insurer) => insurer.profile_id))
  const availableProfiles = profiles.filter((profile) => !linkedProfileIds.has(profile.id))

  return (
    <section className="portal-page">
      <p className="portal-page__eyebrow">Elevated access</p>
      <h2>Insurer management</h2>
      <p>Create an insurer organization link for an existing account whose role has been provisioned as insurer.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
      {notice && <p className="portal-notice" role="status">{notice}</p>}
      <form className="portal-card portal-form" onSubmit={inviteInsurer}>
        <h3>Invite insurer user</h3>
        <label>Email<input type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required maxLength={254} /></label>
        <button className="btn-primary" disabled={inviting}>{inviting ? 'Sending invite...' : 'Send insurer invite'}</button>
      </form>
      <form className="portal-card portal-form" onSubmit={submit}>
        <label>Insurer account
          <select value={form.profile_id} onChange={(event) => setForm((current) => ({ ...current, profile_id: event.target.value }))} required>
            <option value="">Select an insurer user</option>
            {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email || profile.id}</option>)}
          </select>
        </label>
        <label>Organization name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required maxLength={200} /></label>
        <label>License number<input value={form.license_number} onChange={(event) => setForm((current) => ({ ...current, license_number: event.target.value }))} maxLength={120} /></label>
        <label>Contact email<input type="email" value={form.contact_email} onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))} maxLength={254} /></label>
        <label>Contact phone<input value={form.contact_phone} onChange={(event) => setForm((current) => ({ ...current, contact_phone: event.target.value }))} maxLength={40} /></label>
        <button className="btn-primary" disabled={saving || !availableProfiles.length}>{saving ? 'Saving...' : 'Create insurer link'}</button>
      </form>
      <section className="portal-card">
        <h3>Linked insurers</h3>
        {insurers.length === 0 ? <p>No insurer organizations are linked.</p> : (
          <div className="portal-list">
            {insurers.map((insurer) => (
              <article className="portal-list__item" key={insurer.id}>
                <div><strong>{insurer.name}</strong><p>{insurer.license_number || 'No license provided'} · {insurer.contact_email || 'No contact email'}</p><small>Account: {insurer.profile_id}</small></div>
                <button className="btn-ghost" onClick={() => setStatus(insurer, insurer.status === 'active' ? 'suspended' : 'active')}>
                  {insurer.status === 'active' ? 'Suspend' : 'Reactivate'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <form className="portal-card portal-form" onSubmit={generateInvoice}>
        <h3>Generate bulk invoice</h3>
        <label>Insurer<select value={invoiceForm.insurer_id} onChange={(event) => setInvoiceForm((current) => ({ ...current, insurer_id: event.target.value }))} required>
          <option value="">Select insurer</option>
          {insurers.filter((insurer) => insurer.status === 'active').map((insurer) => <option key={insurer.id} value={insurer.id}>{insurer.name}</option>)}
        </select></label>
        <label>Period start<input type="date" value={invoiceForm.period_start} onChange={(event) => setInvoiceForm((current) => ({ ...current, period_start: event.target.value }))} required /></label>
        <label>Period end<input type="date" value={invoiceForm.period_end} onChange={(event) => setInvoiceForm((current) => ({ ...current, period_end: event.target.value }))} required /></label>
        <button className="btn-primary" disabled={saving || !insurers.length}>{saving ? 'Generating...' : 'Generate and mark sent'}</button>
      </form>
      <form className="portal-card portal-form" onSubmit={createPartnership}>
        <h3>Create cohort partnership</h3>
        <label>Insurer<select value={partnership.insurer_id} onChange={(event) => setPartnership((current) => ({ ...current, insurer_id: event.target.value }))} required>
          <option value="">Select insurer</option>
          {insurers.filter((insurer) => insurer.status === 'active').map((insurer) => <option key={insurer.id} value={insurer.id}>{insurer.name}</option>)}
        </select></label>
        <label>B2B client<select value={partnership.b2b_client_id} onChange={(event) => setPartnership((current) => ({ ...current, b2b_client_id: event.target.value }))} required>
          <option value="">Select client cohort</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
        </select></label>
        <label>Cohort name<input value={partnership.cohort_name} onChange={(event) => setPartnership((current) => ({ ...current, cohort_name: event.target.value }))} required maxLength={200} /></label>
        <label>Per-member fee (KES)<input type="number" min="0" step="0.01" value={partnership.per_member_fee} onChange={(event) => setPartnership((current) => ({ ...current, per_member_fee: event.target.value }))} required /></label>
        <label>Contract start<input type="date" value={partnership.contract_start} onChange={(event) => setPartnership((current) => ({ ...current, contract_start: event.target.value }))} /></label>
        <label>Contract end<input type="date" value={partnership.contract_end} onChange={(event) => setPartnership((current) => ({ ...current, contract_end: event.target.value }))} /></label>
        <button className="btn-primary" disabled={saving || !insurers.length || !clients.length}>{saving ? 'Saving...' : 'Create partnership'}</button>
      </form>
      <section className="portal-card">
        <h3>Insurer partnerships</h3>
        {partnerships.length === 0 ? <p>No insurer cohorts are configured.</p> : (
          <div className="portal-list">
            {partnerships.map((item) => (
              <article className="portal-list__item" key={item.id}>
                <div><strong>{item.cohort_name}</strong><p>{insurers.find((insurer) => insurer.id === item.insurer_id)?.name || 'Unknown insurer'} · {clients.find((client) => client.id === item.b2b_client_id)?.company_name || 'No B2B client'}</p></div>
                <span>{item.status} · KES {Number(item.per_member_fee).toLocaleString()} / member</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
