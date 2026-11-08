import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthProfile } from '../context/AuthProfileContext'
import BrandLoader from './BrandLoader'

export default function RequireAuth({ role }) {
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
