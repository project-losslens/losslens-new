import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandLoader } from '../../components/Brand'
import { roleHome } from '../../config/roleHome'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { useDocumentTitle } from '../../hooks'

export default function AuthCallback() {
  useDocumentTitle('Completing sign in')
  const navigate = useNavigate()
  const { authStatus, profile, role } = useAuthProfile()

  useEffect(() => {
    if (authStatus !== 'ready') return
    const destination = role === 'user' && !profile?.onboarding_completed && !profile?.onboarding_skipped
      ? '/onboarding'
      : roleHome(role)
    navigate(destination, { replace: true })
  }, [authStatus, navigate, profile, role])

  if (authStatus === 'ready' || authStatus === 'loading') return <BrandLoader />
  if (authStatus === 'error') {
    return (
      <main className="auth-container">
        <section className="auth-card" role="alert">
          <h1 className="auth-title">We could not complete sign in</h1>
          <p className="auth-sub">Check your connection and try the confirmation link again.</p>
          <Link className="btn-primary full" to="/login">Go to login</Link>
        </section>
      </main>
    )
  }
  return (
    <main className="auth-container">
      <section className="auth-card" role="alert">
        <h1 className="auth-title">Sign-in link not completed</h1>
        <p className="auth-sub">The link may have expired. Request a new one or sign in.</p>
        <Link className="btn-primary full" to="/login">Go to login</Link>
      </section>
    </main>
  )
}
