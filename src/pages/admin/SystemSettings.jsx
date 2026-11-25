import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'

// Only show effective configuration. The previous form saved unused values and
// incorrectly implied that authentication, billing and retention had changed.
export default function SystemSettings() {
  const [state, setState] = useState({ loading: true, error: '', pricing: null, mode: null })
  const refresh = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: '' }))
    try {
      const [response, mode] = await Promise.all([
        fetch('/api/payments/config'),
        supabase.from('system_settings').select('value').eq('key', 'protection_mode').maybeSingle(),
      ])
      if (!response.ok || mode.error) throw new Error('Effective configuration could not be loaded.')
      const pricing = await response.json()
      if (typeof pricing.available !== 'boolean') throw new Error('Payment configuration could not be verified.')
      let value = mode.data?.value || 'off'
      try { value = JSON.parse(value) } catch { /* stored as plain text */ }
      setState({ loading: false, error: '', pricing, mode: value })
    } catch (error) { setState(current => ({ ...current, loading: false, error: error.message })) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  if (state.loading) return <BrandLoader variant="section" />
  return (
    <section className="portal-page" style={{ padding: 24 }}>
      <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>System settings</h2>
        <button type="button" className="btn-ghost" onClick={refresh}>Refresh status</button>
      </div>
      {state.error && <p role="alert" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Effective configuration</h3>
        <dl>
          <dt>Premium payments</dt><dd>{state.pricing ? state.pricing.available ? 'Available' : 'Unavailable' : 'Could not verify'}</dd>
          <dt>Premium price</dt><dd>{state.pricing?.amount ? 'KES ' + state.pricing.amount : 'Not configured'}</dd>
          <dt>Protection mode</dt><dd>{state.mode ?? 'Could not verify'}</dd>
        </dl>
        <Link className="btn-primary" to="/super-admin/protection">Manage Protection settings</Link>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Authentication and operations</h3>
        <p>Signup availability, email verification, password rules and Google sign-in are managed in Supabase Authentication. Payment availability and pricing are managed in the deployment configuration.</p>
        <p>The previous controls for maintenance, feature switches, automatic retention and session limits were not connected to platform behavior. They have been removed to prevent changes that appear successful but do nothing.</p>
        <p>Daily subscription and Protection lifecycle schedules are configured with the deployment. Execution requires the cron secret and database service credentials.</p>
      </div>
      <nav aria-label="Administration workflows" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        <Link to="/super-admin/users">Manage user accounts</Link>
        <Link to="/super-admin/insurance">Manage insurance partners</Link>
        <Link to="/super-admin/logs">Review audit logs</Link>
      </nav>
    </section>
  )
}
