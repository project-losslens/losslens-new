import { useState } from 'react'
import { usePgsi } from '../context/PgsiContext'
import { pgsiPercentage } from '../lib/pgsi'

export default function PgsiDashboardCard() {
  const pgsi = usePgsi()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changePersonalization = async event => {
    const enabled = event.target.checked
    setSaving(true); setError('')
    try { await pgsi.setPersonalization(enabled) } catch { setError('Your personalization choice was not saved. Please retry.') }
    finally { setSaving(false) }
  }
  return <section className="dash-section pgsi-dashboard" aria-label="PGSI self-check">
    <h2>PGSI score &middot; % of maximum</h2>
    {pgsi.error ? <p role="alert">{pgsi.error} <button type="button" className="btn-ghost" onClick={pgsi.refresh}>Retry self-check status</button></p> : !pgsi.loaded ? <p role="status">Loading your private self-check...</p> : pgsi.latest ? <>
      <p className="pgsi-percentage">{pgsiPercentage(pgsi.latest.raw_score)}%</p>
      <p>{pgsi.latest.raw_score}/27 points &middot; {new Date(pgsi.latest.completed_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' })}</p>
      <button type="button" className="btn-ghost" onClick={pgsi.knowMore}>Know more</button>
      <button type="button" className="btn-ghost" onClick={pgsi.startAssessment}>{pgsi.due ? 'Take your due self-check' : 'Take another self-check'}</button>
    </> : <button type="button" className="btn-primary" onClick={pgsi.startAssessment}>Take your first self-check</button>}
    <div className="pgsi-actions"><button type="button" className="btn-ghost" onClick={pgsi.showResources}>Find support at any score</button></div>
    {pgsi.loaded && <label className="pgsi-personalization"><input type="checkbox" checked={pgsi.personalization_enabled} disabled={saving} onChange={changePersonalization} />Let Oloo use my latest PGSI band and completion date</label>}
    <p className="pgsi-muted">Optional: this lets Oloo's AI provider use only your latest band and assessment date when you chat. Your answers are not shared. Turning it off applies to subsequent messages.</p>
    {error && <p role="alert" className="portal-error">{error}</p>}
  </section>
}