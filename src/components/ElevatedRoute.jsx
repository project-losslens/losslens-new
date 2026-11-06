import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const UNLOCK_DURATION_MS = 15 * 60 * 1000

function ElevatedRoute({ children }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)

  useEffect(() => {
    let mounted = true

    const checkAccess = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      if (!mounted) return

      if (!currentUser) {
        navigate('/login', { replace: true })
        return
      }

      setUser(currentUser)

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', currentUser.id)
        .single()

      if (!mounted) return

      if (profile?.is_super_admin !== true) {
        navigate('/admin', { replace: true })
        return
      }

      const unlockedAt = Number(sessionStorage.getItem('elevated_unlocked_at'))
      if (unlockedAt && Date.now() - unlockedAt < UNLOCK_DURATION_MS) {
        setAuthorized(true)
      }

      setLoading(false)
    }

    checkAccess()

    return () => {
      mounted = false
    }
  }, [navigate])

  const unlock = async (event) => {
    event.preventDefault()
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (signInError) {
      setError('Incorrect password. Access denied.')
      return
    }

    await supabase.from('audit_logs').insert({
      admin_id: user.id,
      action: 'ELEVATED_ACCESS_UNLOCK',
    })

    sessionStorage.setItem('elevated_unlocked_at', String(Date.now()))
    setAuthorized(true)
  }

  if (loading) return null
  if (authorized) return children

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <form onSubmit={unlock} style={{ width: '100%', maxWidth: '420px', background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '24px' }}>
        <h2 style={{ marginTop: 0 }}>Elevated Access</h2>
        <p>Re-enter your password to unlock elevated features for 15 minutes.</p>
        <label htmlFor="elevated-password" style={{ display: 'block', marginBottom: '8px' }}>Password</label>
        <input
          id="elevated-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          style={{ boxSizing: 'border-box', width: '100%', padding: '10px', marginBottom: '12px' }}
        />
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: '10px', background: '#0B1220', color: '#fff', border: 0, borderRadius: '4px' }}>
          Unlock
        </button>
      </form>
    </div>
  )
}

export default ElevatedRoute
