import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function ProtectedRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentSession = session

        if (!currentSession) {
          if (mounted) {
            setSessionExpired(true)
            setChecking(false)
          }
          return
        }

        if (!adminOnly && !superAdminOnly) {
          if (mounted) {
            setAuthorized(true)
            setChecking(false)
          }
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentSession.user.id)
          .single()

        if (profileError && profileError.code !== 'PGRST116') {
          if (mounted) {
            setSessionExpired(true)
            setChecking(false)
          }
          return
        }

        const role = profile?.role || 'user'

        if (superAdminOnly && role !== 'super_admin') {
          if (mounted) {
            setChecking(false)
          }
          navigate('/dashboard', { replace: true })
          return
        }

        if (adminOnly && role !== 'admin' && role !== 'super_admin') {
          if (mounted) {
            setChecking(false)
          }
          navigate('/dashboard', { replace: true })
          return
        }

        if (mounted) {
          setAuthorized(true)
          setChecking(false)
        }
      } catch (error) {
        console.error('Auth check error:', error)
        if (mounted) {
          setSessionExpired(true)
          setChecking(false)
        }
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSessionExpired(true)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [navigate, adminOnly, superAdminOnly])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)
            }
          </div>
          <p style={{ color: '#3b7a5a', fontSize: '12px' }}>Loading...</p>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{opacity:0.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-6px)} }`}</style>
      </div>
    )
  }

  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }} aria-hidden="true"></span>
          <h2 style={{ color: '#f59e0b', fontFamily: "'Playfair Display', serif", fontSize: '22px', marginBottom: '8px' }}>Session Expired</h2>
          <p style={{ color: '#6ee7b7', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
            Your session has expired. Please log in again to continue.
          </p>
          <button 
            onClick={() => {
              localStorage.clear()
              sessionStorage.clear()
              navigate('/login', { replace: true })
            }}
            style={{ padding: '14px 32px', borderRadius: '100px', background: '#f59e0b', border: 'none', color: '#041f13', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", width: '100%' }}
          >
            Go to Login
          </button>
          <p style={{ color: '#3b7a5a', fontSize: '11px', marginTop: '16px' }}>Your data is safe. You just need to sign in again.</p>
        </div>
      </div>
    )
  }

  if (!authorized) return null

  return children
}

export default ProtectedRoute
