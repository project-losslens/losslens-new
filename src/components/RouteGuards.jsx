import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthProfile } from '../context/AuthProfileContext'
import AppIcon from './AppIcon'
import { BrandLoader } from './Brand'

/* ---- RequireAuth ---- */

export function RequireAuth({ role }) {
  const location = useLocation()
  const { authStatus, isAdmin, isSuperAdmin, role: currentRole, status, retryProfile } = useAuthProfile()

  useEffect(() => {
    if (authStatus === 'ready' && status === 'suspended') {
      supabase.auth.signOut().then(({ error: signOutError }) => {
        if (signOutError) console.error('Failed to sign out suspended account:', signOutError)
      })
    }
  }, [authStatus, status])

  const suspended = authStatus === 'ready' && status === 'suspended'
  if (suspended) {
    return (
      <section className="auth-retry" role="alert">
        <h1>Account suspended</h1>
        <p>Your account has been signed out. Contact LossLens support if you believe this is an error.</p>
      </section>
    )
  }
  if (authStatus === 'loading') return <BrandLoader />
  if (authStatus === 'no-session') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  if (authStatus === 'error') {
    return (
      <section className="auth-retry" role="alert">
        <h1>We could not load your profile</h1>
        <p>Your sign-in is still active. Check your connection and try again.</p>
        <button type="button" className="btn-primary" onClick={retryProfile}>Retry</button>
      </section>
    )
  }
  if (authStatus !== 'ready') return <BrandLoader />
  if (role === 'admin' && !isAdmin) return <Navigate to="/dashboard" replace />
  if (role === 'super_admin' && !isSuperAdmin) return <Navigate to="/admin" replace />
  if (role === 'therapist' && currentRole !== 'therapist' && !isSuperAdmin) return <Navigate to="/dashboard" replace />
  if (role === 'insurer' && currentRole !== 'insurer' && !isSuperAdmin) return <Navigate to="/dashboard" replace />

  return <Outlet />
}

/* ---- RequireElevated ---- */

const UNLOCK_DURATION_MS = 15 * 60 * 1000

export function RequireElevated() {
  const { authStatus, isSuperAdmin, user } = useAuthProfile()
  const [authorized, setAuthorized] = useState(() => {
    const unlockedAt = Number(sessionStorage.getItem('elevated_unlocked_at'))
    return Boolean(unlockedAt && Date.now() - unlockedAt < UNLOCK_DURATION_MS)
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Server enforces via is_recently_authenticated() on elevated RPCs; this
  // client-side timer is a UX step-up only, NOT security.
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

  if (authStatus === 'loading') return <BrandLoader />
  if (authStatus === 'no-session') return <Navigate to="/login" replace />
  if (authStatus !== 'ready') return <BrandLoader />
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
