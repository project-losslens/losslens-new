import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthStorage, resetAuthBeforeSignIn, supabase } from '../../lib/supabase'
import { PublicLayout } from '../../layouts/PublicLayout'
import { useAuthProfile } from '../../context/AuthProfileContext'

export default function InsurerLogin() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuthProfile()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await resetAuthBeforeSignIn(true)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) throw signInError
      const profile = await refreshProfile(data.user)

      if (!profile || (profile.role !== 'insurer' && profile.role !== 'super_admin')) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) console.error('Could not sign out non-insurer account:', signOutError)
        clearAuthStorage()
        setError(profile
          ? 'This account does not have insurer access. Use the correct portal or contact your administrator.'
          : 'We could not verify your partner account. Please try again.')
        return
      }

      navigate(profile.role === 'super_admin' ? '/admin' : '/insurer', { replace: true })
    } catch (signInError) {
      console.error('Insurer sign-in failed:', signInError)
      setError('Unable to sign in. Check your credentials or contact your LossLens administrator.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout>
      <main className="portal-login">
        <section className="portal-card">
          <p className="portal-page__eyebrow">LossLens partner access</p>
          <h1>Insurer portal</h1>
          <p>Sign in with the account provisioned for your insurance organization.</p>
          {error && <p className="portal-error" role="alert">{error}</p>}
          <form className="portal-form" onSubmit={submit}>
            <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          </form>
          <Link to="/login">Return to LossLens</Link>
        </section>
      </main>
    </PublicLayout>
  )
}
