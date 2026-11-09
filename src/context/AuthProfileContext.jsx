import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthProfileContext = createContext(null)

export function AuthProfileProvider({ children }) {
  const [authState, setAuthState] = useState({ status: 'loading', user: null, profile: null, error: null })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    let generation = 0
    let activeUserId = null
    let loadingUserId = null

    const loadProfile = async (user) => {
      if (!user) {
        generation += 1
        activeUserId = null
        loadingUserId = null
        if (active) setAuthState({ status: 'no-session', user: null, profile: null, error: null })
        return
      }

      if (user.id === activeUserId || user.id === loadingUserId) return
      activeUserId = user.id
      loadingUserId = user.id
      const currentGeneration = ++generation
      if (active) setAuthState({ status: 'loading', user, profile: null, error: null })
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_super_admin, status, onboarding_completed, onboarding_skipped')
        .eq('id', user.id)
        .single()

      if (!active || currentGeneration !== generation) return
      loadingUserId = null
      if (error) {
        activeUserId = null
        setAuthState({ status: 'error', user, profile: null, error })
        return
      }

      setAuthState({ status: 'ready', user, profile, error: null })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfile(session?.user || null)
    })

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        if (active) setAuthState({ status: 'error', user: null, profile: null, error })
        return
      }
      void loadProfile(session?.user || null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [retry])

  const retryProfile = useCallback(() => setRetry((value) => value + 1), [])
  const value = useMemo(() => {
    const profile = authState.profile
    return {
      ...authState,
      authStatus: authState.status,
      loading: authState.status === 'loading',
      role: profile?.role || null,
      isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.is_super_admin === true,
      isSuperAdmin: profile?.role === 'super_admin' || profile?.is_super_admin === true,
      status: profile?.status || null,
      retryProfile,
    }
  }, [authState, retryProfile])

  return <AuthProfileContext.Provider value={value}>{children}</AuthProfileContext.Provider>
}

// The provider and its context hook are intentionally co-located.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthProfile() {
  const context = useContext(AuthProfileContext)
  if (!context) throw new Error('useAuthProfile must be used within AuthProfileProvider')
  return context
}
