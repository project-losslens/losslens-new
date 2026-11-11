import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { clearAuthStorage, supabase } from '../lib/supabase'
import { useAuthProfile } from '../context/AuthProfileContext'
import { roleHome } from '../config/roleHome'
import { requireAuthDecision, publicOnlyDecision } from '../config/routeAccess'
import { BrandLoader } from './Brand'

/* ---- RequireAuth ---- */

export function RequireAuth({ role }) {
  const location = useLocation()
  const { authStatus, isAdmin, isSuperAdmin, role: currentRole, status, retryProfile } = useAuthProfile()

  useEffect(() => {
    if (authStatus === 'ready' && status === 'suspended') {
      const signOutSuspendedAccount = async () => {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        clearAuthStorage()
        if (signOutError) console.error('Failed to sign out suspended account:', signOutError)
      }
      void signOutSuspendedAccount()
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

  const currentPath = `${location.pathname}${location.search}${location.hash}`
  const decision = requireAuthDecision({ authStatus, role, currentRole, isAdmin, isSuperAdmin, status, path: currentPath })
  if (decision === 'loading') return <BrandLoader />
  if (decision === 'no-session') {
    return <Navigate to="/login" replace state={{ from: currentPath }} />
  }
  if (decision === 'error') {
    return (
      <section className="auth-retry" role="alert">
        <h1>We could not load your profile</h1>
        <p>Your sign-in is still active. Check your connection and try again.</p>
        <button type="button" className="btn-primary" onClick={retryProfile}>Retry</button>
      </section>
    )
  }
  if (decision === 'ready-other-role') {
    return <Navigate to={roleHome(currentRole)} replace />
  }
  if (decision === 'redirect') return <Navigate to={roleHome(currentRole)} replace />

  return <Outlet />
}

export function PublicOnly() {
  const { authStatus, user, role, retryProfile } = useAuthProfile()

  const decision = publicOnlyDecision({ authStatus, user })
  if (decision === 'loading') return <BrandLoader />
  if (decision === 'error') {
    return (
      <section className="auth-retry" role="alert">
        <h1>We could not load your profile</h1>
        <p>Your sign-in is still active. Check your connection and try again.</p>
        <button type="button" className="btn-primary" onClick={retryProfile}>Retry</button>
      </section>
    )
  }
  if (decision === 'redirect') return <Navigate to={roleHome(role)} replace />
  return <Outlet />
}
