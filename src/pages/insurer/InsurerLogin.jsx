import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function InsurerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      console.error('Insurer sign-in failed:', signInError)
      setError('Unable to sign in. Check your credentials or contact your LossLens administrator.')
      setLoading(false)
      return
    }
    navigate('/insurer', { replace: true })
  }

  return (
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
  )
}
