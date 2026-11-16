import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'

const formatDate = (value) => new Date(value).toLocaleString()

export default function SupportInbox() {
  const [tickets, setTickets] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTickets = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('support_list_tickets')
    if (loadError) {
      console.error('Admin support inbox load failed:', loadError)
      setError('Could not load support requests.')
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
      console.error('Admin support reply failed:', replyError)
      setError(replyError.message || 'Could not send the reply.')
    } else {
      setDrafts(current => ({ ...current, [ticketId]: '' }))
      setError('')
      await loadTickets()
    }
    setSaving(false)
  }

  const setStatus = async (ticketId, status) => {
    setSaving(true)
    const { error: statusError } = await supabase.rpc('support_set_ticket_status', {
      p_ticket_id: ticketId,
      p_status: status,
    })
    if (statusError) {
      console.error('Support ticket status update failed:', statusError)
      setError(statusError.message || 'Could not update the ticket.')
    } else {
      setError('')
      await loadTickets()
    }
    setSaving(false)
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Administration</p><h1>Support inbox</h1></div>
      </header>
      {error && <p className="portal-error" role="alert">{error} <button type="button" onClick={() => { void loadTickets() }}>Retry</button></p>}
      {tickets.length === 0 ? <p className="portal-notice">No support requests.</p> : (
        <div className="portal-list">
          {tickets.map(ticket => (
            <article className="portal-card" key={ticket.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p className="portal-page__eyebrow">{ticket.category} · {ticket.status.replace('_', ' ')}</p>
                  <h2>{ticket.subject}</h2>
                  <small>Account {ticket.user_id} · Opened {formatDate(ticket.created_at)}</small>
                </div>
                <select aria-label={`Set status for ${ticket.subject}`} value={ticket.status} disabled={saving}
                  onChange={event => { void setStatus(ticket.id, event.target.value) }}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="portal-list" style={{ margin: '14px 0' }}>
                {(ticket.messages || []).map(message => (
                  <div key={message.id} style={{ borderLeft: '2px solid var(--border)', padding: '4px 10px' }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                    <small>{message.sender_id === ticket.user_id ? 'Requester' : 'Support'} · {formatDate(message.created_at)}</small>
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
  )
}
