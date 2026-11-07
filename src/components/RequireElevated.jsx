import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthProfile } from '../context/AuthProfileContext'
import AppIcon from './AppIcon'
import PageLoader from './PageLoader'

const UNLOCK_DURATION_MS = 15 * 60 * 1000

export default function RequireElevated() {
  const { authStatus, isSuperAdmin, user } = useAuthProfile()
  const [authorized, setAuthorized] = useState(() => {
    const unlockedAt = Number(sessionStorage.getItem('elevated_unlocked_at'))
    return Boolean(unlockedAt && Date.now() - unlockedAt < UNLOCK_DURATION_MS)
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // This client-side timer is a UX step-up only, NOT security. Enforce access server-side with RLS or a short-lived claim.
  useEffect(() => {
    if (!authorized) return undefined
    const unlockedAt = Number(sessionStorage.getItem('elevated_unlocked_at'))
    const expiresIn = Math.max(0, unlockedAt + UNLOCK_DURATION_MS - Date.now())
    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem('elevated_unlocked_at')
      setAuthorized(false)
      window.dispatchEvent(new Event('elevated-access-change'))
    }, expiresIn)
    return () => window.clearTimeout(timeout)
  }, [authorized])

  if (authStatus === 'loading') return <PageLoader />
  if (authStatus === 'no-session') return <Navigate to="/login" replace />
  if (authStatus !== 'ready') return <PageLoader />
  if (!isSuperAdmin) return <Navigate to="/admin" replace />
  if (authorized) return <Outlet />

  const unlock = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password })

    if (signInError) {
      setError('Incorrect password. Access denied.')
      setSubmitting(false)
      return
    }

    const { error: auditError } = await supabase.rpc('log_admin_action', {
      p_action: 'elevated_access_unlocked',
      p_target_table: null,
      p_target_id: null,
      p_metadata: { duration_minutes: 15 },
    })
    if (auditError) console.error('Failed to log elevated access unlock:', auditError)

    sessionStorage.setItem('elevated_unlocked_at', String(Date.now()))
    window.dispatchEvent(new Event('elevated-access-change'))
    setAuthorized(true)
    setSubmitting(false)
  }

  return (
    <section className="elevated-gate" aria-labelledby="elevated-title">
      <form className="elevated-gate__card" onSubmit={unlock}>
        <AppIcon name="shield" size={32} />
        <h1 id="elevated-title">Elevated Access</h1>
        <p>Re-enter your password to unlock sensitive admin features for 15 minutes.</p>
        <label htmlFor="elevated-password">Password</label>
        <input id="elevated-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="elevated-gate__error" role="alert">{error}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Verifying...' : 'Unlock access'}</button>
      </form>
    </section>
  )
}
