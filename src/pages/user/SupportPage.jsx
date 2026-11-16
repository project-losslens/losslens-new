import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'

const CATEGORIES = [
  ['account', 'Account'],
  ['technical', 'Technical issue'],
  ['billing', 'Billing'],
  ['protection', 'Protection'],
  ['other', 'Other'],
]

const formatDate = (value) => new Date(value).toLocaleString()

export default function SupportPage() {
  const [tickets, setTickets] = useState([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('account')
  const [body, setBody] = useState('')
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTickets = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('support_list_tickets')
    if (loadError) {
      console.error('Support ticket load failed:', loadError)
      setError('Could not load your support requests.')
    } else {
      setTickets(data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTickets() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadTickets])

  const submitTicket = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { error: submitError } = await supabase.rpc('support_submit_ticket', {
      p_subject: subject,
      p_category: category,
      p_body: body,
    })
    if (submitError) {
      console.error('Support ticket submit failed:', submitError)
      setError(submitError.message || 'Could not submit your request.')
    } else {
      setSubject('')
      setBody('')
      toast.success('Your support request was sent.')
      await loadTickets()
    }
    setSaving(false)
  }

  const reply = async (event, ticketId) => {
    event.preventDefault()
    const message = drafts[ticketId]?.trim()
    if (!message) return
    setSaving(true)
    const { error: replyError } = await supabase.rpc('support_add_message', {
      p_ticket_id: ticketId,
      p_body: message,
    })
    if (replyError) {
      console.error('Support ticket reply failed:', replyError)
      setError(replyError.message || 'Could not send your reply.')
    } else {
      setDrafts(current => ({ ...current, [ticketId]: '' }))
      setError('')
      await loadTickets()
    }
    setSaving(false)
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Help</p><h1>Support requests</h1></div>
      </header>
      <p className="portal-notice">For urgent safety concerns, use the crisis support options instead of this form.</p>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={() => { void loadTickets() }}>Retry</button></p>}
      <form className="portal-card portal-form" onSubmit={submitTicket}>
        <h2>Contact support</h2>
        <label>Topic
          <select value={category} onChange={event => setCategory(event.target.value)}>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={160} required /></label>
        <label>Message<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={5} required /></label>
        <button className="btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button>
      </form>

      <section className="portal-card">
        <h2>Your requests</h2>
        {tickets.length === 0 ? <p>You have not submitted any support requests.</p> : (
          <div className="portal-list">
            {tickets.map(ticket => (
              <article className="portal-list__item" key={ticket.id} style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{ticket.subject}</strong>
                  <span>{ticket.status.replace('_', ' ')}</span>
                </div>
                <p>{ticket.category} · Updated {formatDate(ticket.updated_at)}</p>
                <div className="portal-list" style={{ margin: '12px 0' }}>
                  {(ticket.messages || []).map(message => (
                    <div key={message.id} style={{ borderLeft: '2px solid var(--border)', padding: '4px 10px' }}>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                      <small>{message.sender_id === ticket.user_id ? 'You' : 'Support'} · {formatDate(message.created_at)}</small>
                    </div>
                  ))}
                </div>
                {ticket.status !== 'closed' && (
                  <form className="portal-form" onSubmit={event => { void reply(event, ticket.id) }}>
                    <label>Reply<textarea value={drafts[ticket.id] || ''} onChange={event => setDrafts(current => ({ ...current, [ticket.id]: event.target.value }))} maxLength={4000} rows={3} required /></label>
                    <button className="btn-primary" disabled={saving}>Send reply</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
