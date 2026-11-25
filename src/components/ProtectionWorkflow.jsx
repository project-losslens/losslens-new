import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthProfile } from '../context/AuthProfileContext'
import { PROTECTION_STATUS } from '../config/protectionProducts'

const routes = [['individual', 'Individual cover'], ['medical_rider', 'Medical rider'], ['group', 'Group cover']]
const label = value => String(value || '').replace(/_/g, ' ')
const date = value => value ? new Date(value).toLocaleString() : ''

export function ProtectionIntroduction() {
  const { user, profile, role, loginKey } = useAuthProfile()
  const location = useLocation()
  const [state, setState] = useState(null)
  const [blocked, setBlocked] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (role !== 'user' || !user?.id) return undefined
    void supabase.rpc('member_protection_reminder').then(result => { if (active) setState(result.error ? null : result.data) })
    return () => { active = false }
  }, [user?.id, role, loginKey, location.pathname])
  useEffect(() => {
    const check = () => setBlocked(Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], .crisis-access__sheet, .pgsi-dialog')))
    const observer = new MutationObserver(check)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-hidden'] })
    const urgent = () => { setState(null); check() }
    const timer = setTimeout(check, 800)
    window.addEventListener('losslens:crisis-support', urgent)
    return () => { observer.disconnect(); clearTimeout(timer); window.removeEventListener('losslens:crisis-support', urgent) }
  }, [])
  const dismiss = async action => {
    setBusy(true)
    const result = await supabase.rpc('member_protection_reminder', { p_action: action })
    if (result.error) setError('Your reminder preference was not saved. Please try again.')
    else { setState(result.data); setError('') }
    setBusy(false)
  }
  if (role !== 'user' || location.pathname !== '/dashboard' || profile?.must_change_password || !(profile?.onboarding_completed || profile?.onboarding_skipped) || blocked || !state) return null
  if (state.has_status) return <p className="protection-status-link"><Link to="/protection-member">View your Protection status</Link></p>
  if (!state.show) return null
  return <aside className="portal-card protection-introduction" aria-label="LossLens Protection introduction">
    <h2>Meet LossLens Protection</h2><p>Explore proposed treatment cover and how an insurer could help. Recovery support remains available without cover.</p>
    <p>{PROTECTION_STATUS}</p>{error && <p role="alert">{error}</p>}
    <div className="portal-form__actions"><Link className="btn-primary" to="/protection-member">Explore Protection</Link><button type="button" className="btn-secondary" disabled={busy} onClick={() => dismiss('later')}>Remind me later</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => dismiss('never')}>Don’t remind me</button></div>
  </aside>
}

export function MemberProtectionJourney() {
  const { user } = useAuthProfile()
  const [journey, setJourney] = useState({ enquiries: [], policies: [] })
  const [route, setRoute] = useState('individual')
  const [recipient, setRecipient] = useState(null)
  const [recipientRefresh, setRecipientRefresh] = useState(0)
  const [recipientError, setRecipientError] = useState('')
  const [phone, setPhone] = useState('')
  const [memberName, setMemberName] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(crypto.randomUUID())
  const load = useCallback(async () => {
    const activation = await supabase.rpc('protection_refresh_activation')
    const result = await supabase.rpc('member_protection_journey')
    if (result.error || activation.error || !Array.isArray(result.data?.enquiries) || !Array.isArray(result.data?.policies)) setError('Protection status could not be loaded. Refresh or contact LossLens support if this continues. General recovery support is still available.')
    else { setJourney(result.data || { enquiries: [], policies: [] }); setError('') }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    let active = true
    void supabase.from('profiles').select('phone,full_name,username').eq('id', user?.id).maybeSingle().then(result => { if (active && !result.error) { setPhone(result.data?.phone || user?.phone || ''); setMemberName(result.data?.full_name || result.data?.username || '') } })
    return () => { active = false }
  }, [user?.id, user?.phone])
  useEffect(() => {
    let active = true
    void supabase.rpc('member_callback_recipient', { p_route: route }).then(result => { if (active) { setRecipient(result.error ? null : result.data); setRecipientError(result.error ? 'Callback availability could not be checked. Refresh availability or contact LossLens support if this continues.' : ''); setConsent(false); request.current = crypto.randomUUID() } })
    return () => { active = false }
  }, [route, recipientRefresh])
  const submit = async event => {
    event.preventDefault(); setBusy(true); setMessage(''); setError('')
    try {
      const result = await supabase.rpc('member_request_callback', { p_request_id: request.current, p_route: route, p_insurer_id: recipient?.id, p_recipient_name: recipient?.name, p_phone: phone, p_consent: consent })
      if (result.error) throw result.error
      if (result.data?.requires_confirmation) {
        setRecipient(result.data.recipient); setConsent(false)
        setMessage('The available insurer changed. Review the new recipient and confirm consent again. Nothing has been sent.')
      } else {
        if (!result.data?.id) throw new Error('The callback request was not confirmed.')
        setConsent(false); await load(); setMessage('Your callback enquiry has been saved. No policy has been activated.')
      }
    } catch (failure) { setError(failure.message || 'Callback request failed. Check your status before retrying.') }
    finally { setBusy(false) }
  }
  const withdraw = async id => {
    setBusy(true)
    const result = await supabase.rpc('protection_update_enquiry', { p_id: id, p_status: 'withdrawn' })
    if (result.error) setError(result.error.message)
    else await load()
    setBusy(false)
  }
  return <section className="protection-journey">
    <header className="portal-card protection-journey__heading"><h2>LossLens Protection</h2><p>Your enquiry, cover and treatment referral in one place.</p></header>
    <section className="portal-card"><h3>What help could this cover?</h3><p>Proposed cover concerns clinically necessary treatment for gambling harm. Approved policy terms, exclusions, clinical assessment and any pre-authorisation determine what is covered. It does not repay gambling losses, stakes or debts.</p>
      <h3>Who decides the premium and terms?</h3><p>A licensed insurer underwrites, quotes and issues cover. LossLens does not set or collect insurance premiums.</p>
      <h3>What information is shared for a call?</h3><p>Only your name, confirmed callback number, requested cover route and your consent go to the insurer named below. Your authentication phone number stays unchanged. Chat, PGSI results, diaries and unrelated clinical information are excluded.</p>
      <h3>What happens next?</h3><p>The agent contacts you, explains eligibility and terms, and records your decision. A callback or quote does not activate cover. After issuance, effective dates and premium requirements apply. An eligible therapist is assigned when cover becomes effective; treatment consent and claim decisions remain separate. The insurer pays the therapist directly for approved treatment. LossLens tracks progress and does not send the money.</p>
      <Link to="/protection">Read the proposed product details</Link> · <Link to="/resources">Get recovery support without cover</Link>
    </section>
    {error && <p role="alert" className="portal-error">{error} <button type="button" onClick={load}>Refresh status</button></p>}
    {message && <p role="status">{message}</p>}
    {journey.enquiries.map(enquiry => <article className="portal-card" key={enquiry.id}><h3>{enquiry.recipient_name}</h3><p>Callback number: {enquiry.callback_phone} · {label(enquiry.status)}</p>
      {enquiry.agent_phone && <p><a href={`tel:${enquiry.agent_phone}`}>Call the verified agent contact</a>{enquiry.agent_email && <> · <a href={`mailto:${enquiry.agent_email}`}>Email the verified agent contact</a></>}</p>}
      {!enquiry.agent_phone && <p>Agent contact details have not been verified. The company will use your callback number.</p>}
      <ol>{enquiry.events?.map((entry, index) => <li key={`${entry.created_at}-${index}`}>{label(entry.status)} · {date(entry.created_at)}</li>)}</ol>
      {['requested','contacted','awaiting_member_decision'].includes(enquiry.status) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => withdraw(enquiry.id)}>Withdraw callback request</button>}
    </article>)}
    {journey.policies.map(policy => <article className="portal-card" key={policy.policy_id}><h3>{policy.insurer} · {policy.policy_number}</h3><p>Cover: {label(policy.status)} · Starts {policy.commencement_date} · Ends {policy.expiry_date || 'as stated in policy'}</p>
      {policy.assignment_status === 'ended' ? <p>This covered referral has ended. <Link to="/resources">General recovery support remains available</Link>.</p> : policy.assignment_status === 'awaiting_therapist' ? <p>Awaiting therapist assignment. Your insurer’s staff can retry when a network therapist is available.</p> : policy.therapist ? <p>Assigned therapist: <strong>{policy.therapist}</strong> · {label(policy.referral_status)}. Follow the treatment-consent and episode steps below, or <Link to="/support">request help with your referral</Link>.</p> : <p>A therapist is assigned after cover becomes effective and premium requirements are met.</p>}
    </article>)}
    {!journey.enquiries.some(e => ['requested','contacted','awaiting_member_decision'].includes(e.status)) && !journey.policies.some(p => ['active','grace','scheduled','issued'].includes(p.status)) && <form className="portal-card portal-form" onSubmit={submit}>
      <h3>Speak to an insurance agent</h3><label>Cover route<select value={route} onChange={event => setRoute(event.target.value)}>{routes.map(([id,name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      {!recipient ? <div><p role={recipientError ? 'alert' : undefined}>{recipientError || `${PROTECTION_STATUS} No active eligible insurer is configured for this route, so callback requests and live enrolment are unavailable.`}</p><button type="button" className="btn-secondary" disabled={busy} onClick={() => setRecipientRefresh(value => value + 1)}>Refresh callback availability</button></div> : <>
        <p>Recipient: <strong>{recipient.name}</strong> · Name to share: {memberName || 'Your account name'}</p><label>Confirm your callback number<input type="tel" autoComplete="tel" maxLength={24} value={phone} onChange={e => { setPhone(e.target.value); setConsent(false) }} required /></label>
        <label className="consent-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />I confirm this number and consent to share my name, callback number and cover route with {recipient.name} for this enquiry.</label>
        <button className="btn-primary" disabled={busy || !consent}>Speak to an insurance agent</button>
      </>}
    </form>}
  </section>
}

export function ProtectionEnquiryQueue() {
  const [rows, setRows] = useState([])
  const [versions, setVersions] = useState([])
  const [forms, setForms] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const activation = await supabase.rpc('protection_refresh_activation')
    const [enquiries, products] = await Promise.all([supabase.from('protection_enquiries').select('*').order('created_at', { ascending: false }), supabase.rpc('protection_portal_setup')])
    if (enquiries.error || products.error || activation.error || !Array.isArray(products.data?.versions)) setError('Could not load enquiries or approved terms. Retry or contact LossLens support to check your portal access.')
    else { setRows(enquiries.data || []); setVersions(products.data?.versions || []); setError('') }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const update = async (row, status) => {
    setBusy(row.id)
    const result = await supabase.rpc('protection_update_enquiry', { p_id: row.id, p_status: status })
    if (result.error) setError(result.error.message)
    else await load()
    setBusy('')
  }
  const edit = (id, key, value) => setForms(old => ({ ...old, [id]: { ...old[id], [key]: value } }))
  const issue = async (event, row) => {
    event.preventDefault(); setBusy(row.id)
    const f = forms[row.id]
    const result = await supabase.rpc('insurer_issue_enquiry_policy', { p_enquiry: row.id, p_version: f.version, p_reference: f.reference, p_start: f.start, p_end: f.end, p_premium: f.premium === '' || f.premium == null ? null : Number(f.premium) })
    if (result.error) setError(result.error.message)
    else if (!result.data) setError('Policy issuance was not confirmed.')
    else await load()
    setBusy('')
  }
  return <section className="portal-card"><h2>Agent callback enquiries</h2>{error && <p className="portal-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}{!error && !rows.length && <p>No callback enquiries.</p>}
    {rows.map(row => { const f = forms[row.id] || {}; return <article className="portal-card" key={row.id}><h3>{row.member_name || (row.member_id ? 'Member' : 'Former member')} · {label(row.route)}</h3><p>{row.callback_phone ? <>Confirmed callback: <a href={`tel:${row.callback_phone}`}>{row.callback_phone}</a></> : 'Contact details removed with the account'} · {label(row.status)}</p><p>Consented to {row.recipient_name} on {date(row.consent_at)} ({row.consent_version}).</p>
      <div className="portal-form__actions">{row.status === 'requested' && <button type="button" className="btn-primary" disabled={busy === row.id} onClick={() => update(row,'contacted')}>Mark contacted</button>}{row.status === 'contacted' && <button type="button" className="btn-primary" disabled={busy === row.id} onClick={() => update(row,'awaiting_member_decision')}>Awaiting member decision</button>}{['requested','contacted','awaiting_member_decision'].includes(row.status) && <button type="button" className="btn-secondary" disabled={busy === row.id} onClick={() => update(row,'declined')}>Decline enquiry</button>}</div>
      {row.status === 'awaiting_member_decision' && <form className="portal-form" onSubmit={e => issue(e,row)}><h4>Record policy issuance after the member accepts</h4>
        <label>Approved benefit terms<select value={f.version || ''} onChange={e => edit(row.id,'version',e.target.value)} required><option value="">Select approved version</option>{versions.filter(v => v.insurer_id === row.insurer_id).map(v => <option key={v.id} value={v.id}>Version {v.version_no} · {v.premium_frequency} · KES {v.premium_amount}</option>)}</select></label>
        <label>Policy reference<input value={f.reference || ''} onChange={e => edit(row.id,'reference',e.target.value)} maxLength={200} required /></label><label>Effective start<input type="date" value={f.start || ''} onChange={e => edit(row.id,'start',e.target.value)} required /></label><label>Effective end<input type="date" value={f.end || ''} min={f.start || undefined} onChange={e => edit(row.id,'end',e.target.value)} required /></label><label>Quoted premium (KES, blank uses approved terms)<input type="number" min="0" step="0.01" value={f.premium ?? ''} onChange={e => edit(row.id,'premium',e.target.value)} /></label><button className="btn-primary" disabled={busy === row.id}>Record issued policy</button><p>Issuance does not bypass premium requirements. Record premiums in the policyholders section. Future cover remains scheduled.</p></form>}
    </article> })}
  </section>
}

export function ProtectionAssignmentQueue() {
  const { role } = useAuthProfile()
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [reasons, setReasons] = useState({})
  const load = useCallback(async () => {
    const result = await supabase.from('protection_assignments').select('policy_id,status,therapist_id,updated_at').order('updated_at',{ascending:false})
    if (result.error) setError('Could not load therapist assignment status.')
    else { setRows(result.data || []); setError('') }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const act = async (row, action) => {
    setBusy(row.policy_id)
    const result = role === 'therapist' ? await supabase.rpc('protection_referral_respond',{p_policy:row.policy_id,p_accept:action==='accept'}) : await supabase.rpc('protection_assign_therapist',{p_policy:row.policy_id,p_reassign:action==='reassign',p_reason:action==='reassign'?reasons[row.policy_id]:'Retry available network'})
    if (result.error) setError(result.error.message)
    else await load()
    setBusy('')
  }
  return <section className="portal-card"><h2>Protection therapist assignments</h2>{error && <p role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}{!rows.length && <p>No Protection assignments.</p>}{rows.map(row => <article className="portal-card" key={row.policy_id}><h3>Policy {row.policy_id}</h3><p>{row.status === 'awaiting_therapist' ? 'Awaiting therapist assignment' : label(row.status)}</p>{role === 'therapist' ? row.status === 'assigned' && <div className="portal-form__actions"><button type="button" className="btn-primary" disabled={busy === row.policy_id} onClick={() => act(row,'accept')}>Accept referral</button><button type="button" className="btn-secondary" disabled={busy === row.policy_id} onClick={() => act(row,'decline')}>Decline referral</button></div> : row.status !== 'ended' && <div className="portal-form"><button type="button" className="btn-secondary" disabled={busy === row.policy_id} onClick={() => act(row,'retry')}>Retry available therapist</button>{['assigned','accepted'].includes(row.status) && <><label>Reason for reassignment<input maxLength={500} value={reasons[row.policy_id] || ''} onChange={e => setReasons(old => ({...old,[row.policy_id]:e.target.value}))} /></label><button type="button" className="btn-secondary" disabled={busy === row.policy_id || (reasons[row.policy_id] || '').trim().length<5} onClick={() => act(row,'reassign')}>Reassign through approved network</button></>}</div>}</article>)}</section>
}

export function ProtectionNetworkSettings({ insurers = [] }) {
  const { role } = useAuthProfile()
  const [network, setNetwork] = useState([])
  const [companies, setCompanies] = useState([])
  const [therapists, setTherapists] = useState([])
  const [form, setForm] = useState({ insurer:'',therapist:'',available:true,capacity:10 })
  const [config, setConfig] = useState({ insurer:'',routes:[],phone:'',email:'',verified:false })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [net, clinicians, setup] = await Promise.all([supabase.from('insurer_therapist_network').select('*'),supabase.rpc('protection_network_candidates'),supabase.rpc('protection_portal_setup')])
    if (net.error || clinicians.error || setup.error || !Array.isArray(clinicians.data) || !Array.isArray(setup.data?.insurers)) setMessage('Could not load the approved network. Refresh or contact LossLens support to check your portal access.')
    else { setNetwork(net.data || []); setTherapists(clinicians.data || []); setCompanies(setup.data?.insurers || []) }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const save = async event => {
    event.preventDefault(); setBusy(true)
    const result = await supabase.rpc('protection_set_network',{p_insurer:form.insurer,p_therapist:form.therapist,p_approved:true,p_available:form.available,p_capacity:Number(form.capacity)})
    setMessage(result.error ? result.error.message : 'Network eligibility saved. Retry waiting assignments when capacity is available.')
    if (!result.error) await load()
    setBusy(false)
  }
  const configure = async event => {
    event.preventDefault();setBusy(true)
    const result = await supabase.rpc('protection_configure_callback',{p_insurer:config.insurer,p_routes:config.routes,p_contact_phone:config.phone,p_contact_email:config.email,p_verified:config.verified})
    setMessage(result.error ? result.error.message : 'Callback configuration saved. Approved terms, an active partnership and pilot/live mode are also required.')
    setBusy(false)
  }
  return <section className="portal-card"><h2>Approved therapist network</h2>{message && <p role="status">{message}</p>}<form className="portal-form" onSubmit={save}><label>Insurer<select required value={form.insurer} onChange={e=>setForm({...form,insurer:e.target.value})}><option value="">Select insurer</option>{(companies.length ? companies : insurers).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label>Verified therapist<select required value={form.therapist} onChange={e=>setForm({...form,therapist:e.target.value})}><option value="">Select therapist</option>{therapists.map(t=><option key={t.id} value={t.id}>{t.full_name || t.specialty || t.id}</option>)}</select></label><label>Concurrent referral capacity<input type="number" min="1" max="1000" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})} required /></label><label className="consent-label"><input type="checkbox" checked={form.available} onChange={e=>setForm({...form,available:e.target.checked})} />Available for new referrals</label><button className="btn-primary" disabled={busy}>Approve or update network member</button></form>
    <ul>{network.map(n=><li key={`${n.insurer_id}-${n.therapist_id}`}>{(companies.length ? companies : insurers).find(i=>i.id===n.insurer_id)?.name || n.insurer_id} · {n.therapist_id} · {n.approved?'approved':'not approved'} · {n.available?'available':'unavailable'} · capacity {n.capacity}</li>)}</ul>
    {role==='super_admin' && <form className="portal-form" onSubmit={configure}><h3>Callback routes and verified agent contact</h3><label>Insurer<select required value={config.insurer} onChange={e=>setConfig({...config,insurer:e.target.value})}><option value="">Select insurer</option>{(companies.length ? companies : insurers).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>{routes.map(([id,name])=><label className="consent-label" key={id}><input type="checkbox" checked={config.routes.includes(id)} onChange={e=>setConfig({...config,routes:e.target.checked?[...config.routes,id]:config.routes.filter(x=>x!==id)})} />{name}</label>)}<label>Verified agent phone (E.164)<input type="tel" value={config.phone} onChange={e=>setConfig({...config,phone:e.target.value})} /></label><label>Verified agent email<input type="email" value={config.email} onChange={e=>setConfig({...config,email:e.target.value})} /></label><label className="consent-label"><input type="checkbox" checked={config.verified} onChange={e=>setConfig({...config,verified:e.target.checked})} />I have verified these business contact details</label><button className="btn-primary" disabled={busy}>Save callback configuration</button></form>}
  </section>
}
