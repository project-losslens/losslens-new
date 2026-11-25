import SupportChoices from '../../components/SupportChoices'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SUPPORT_STATUSES } from '../../lib/supportRequests'
import { BrandLoader } from '../../components/Brand'

const CATEGORIES = [
  ['account', 'Account'],
  ['technical', 'Technical issue'],
  ['billing', 'Billing'],
  ['protection', 'Protection'],
  ['other', 'Other'],
]

export default function SupportPage() {
  const [tickets, setTickets] = useState([])
  const [composerOpen, setComposerOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('account')
  const [body, setBody] = useState('')
  const [receipt, setReceipt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase.rpc('support_request_list')
    if (!error) setTickets(data || [])
    setListError(Boolean(error))
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTickets() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadTickets])

  const submitTicket = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setSubmitError(false)
    try {
      const { data, error } = await supabase.rpc('support_submit_request', {
        p_subject: subject,
        p_category: category,
        p_body: body,
      })
      if (error || !data) throw new Error('Submission not confirmed')
      setReceipt(data)
      setSubject('')
      setCategory('account')
      setBody('')
      setComposerOpen(false)
      await loadTickets()
    } catch {
      setSubmitError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Help</p><h2>Support requests</h2><SupportChoices /></div>
      </header>
      <p className="portal-notice">For urgent safety concerns, use the crisis support options instead of this form.</p>
      <div role="status">{receipt && <p className="portal-notice">Message sent. Your ticket is <strong>{receipt}</strong>. We’ll review your request.</p>}</div>
      {!composerOpen && <button type="button" className="btn-primary" onClick={() => { setReceipt(''); setComposerOpen(true) }}>New support request</button>}
      {composerOpen && (
        <form className="portal-card portal-form" onSubmit={submitTicket}>
          <h2>Contact support</h2>
          <label>Topic
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={160} required /></label>
          <label>Message<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={5} required /></label>
          {submitError && <p className="portal-error" role="alert">Could not confirm your request was sent. Please try again.</p>}
          <div className="portal-form__actions">
            <button className="btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button>
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => setComposerOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      <section className="portal-card">
        <h2>Your tickets</h2>
        <button type="button" className="btn-ghost" onClick={() => { void loadTickets() }}>Refresh status</button>
        {loading ? <BrandLoader variant="section" /> : listError ? <p className="portal-error" role="alert">Could not load your tickets. Try refreshing.</p>
          : tickets.length === 0 ? <p>You have not submitted any support requests.</p> : (
            <ul className="portal-list">
              {tickets.map(ticket => (
                <li className="portal-list__item" key={ticket.id}>
                  <div><strong>{ticket.reference} · {ticket.subject}</strong><br /><small>Updated {new Date(ticket.updated_at).toLocaleString()}</small></div>
                  <span>{SUPPORT_STATUSES[ticket.status] ?? ticket.status}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </section>
  )
}
