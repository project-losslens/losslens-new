import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SUPPORT_STATUSES } from '../../lib/supportRequests'
import { BrandLoader } from '../../components/Brand'

export default function SupportInbox() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTickets = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('support_request_list', { p_staff: true })
    if (!loadError) setTickets(data || [])
    setError(loadError ? 'Could not load support requests.' : '')
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTickets() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadTickets])

  const setStatus = async (ticketId, status) => {
    setSaving(true)
    const { error: statusError } = await supabase.rpc('support_set_ticket_status', {
      p_ticket_id: ticketId,
      p_status: status,
    })
    if (statusError) setError('Could not update the ticket.')
    else await loadTickets()
    setSaving(false)
  }

  if (loading) return <BrandLoader variant="section" />

  return (
    <section className="portal-page">
      <header className="portal-page__heading">
        <div><p className="portal-page__eyebrow">Administration</p><h2>Support inbox</h2></div>
        <button type="button" className="btn-ghost" disabled={saving} onClick={() => { void loadTickets() }}>Refresh</button>
      </header>
      {error && <p className="portal-error" role="alert">{error}</p>}
      {tickets.length === 0 && !error && <p className="portal-notice">No support requests.</p>}
      <div className="portal-list">
        {tickets.map(ticket => (
          <article className="portal-card" key={ticket.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="portal-page__eyebrow">{ticket.reference} · {ticket.category}</p>
                <h2>{ticket.subject}</h2>
                <small>{ticket.user_id ? `Account ${ticket.user_id}` : `Website request · ${ticket.guest_email}`}</small>
                <br /><small>Received {new Date(ticket.created_at).toLocaleString()}</small>
              </div>
              <label>Status
                <select aria-label={`Status for ${ticket.reference}`} value={ticket.status} disabled={saving}
                  onChange={event => { void setStatus(ticket.id, event.target.value) }}>
                  {Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            {ticket.message && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ticket.message}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}
