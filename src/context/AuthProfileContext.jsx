import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearSupabaseStorage, supabase } from '../lib/supabase'

const AuthProfileContext = createContext(null)
const PROFILE_COLUMNS = 'id, username, avatar_url, role, is_super_admin, status, onboarding_completed, onboarding_skipped'

export function AuthProfileProvider({ children }) {
  const [authState, setAuthState] = useState({ status: 'loading', user: null, profile: null, error: null })
  const mountedRef = useRef(false)
  const requestIdRef = useRef(0)
  const persistenceCheckRef = useRef(null)

  const loadProfile = useCallback(async (user) => {
    const requestId = ++requestIdRef.current
    if (!user) {
      if (mountedRef.current) setAuthState({ status: 'no-session', user: null, profile: null, error: null })
      return null
    }

    setAuthState((previous) => previous.status === 'ready' && previous.user?.id === user.id
      ? { ...previous, user, error: null }
      : { status: 'loading', user, profile: null, error: null })

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .single()

    if (!mountedRef.current || requestId !== requestIdRef.current) return null
    if (error) {
      setAuthState({ status: 'error', user, profile: null, error })
      return null
    }

    setAuthState({ status: 'ready', user, profile, error: null })
    return profile
  }, [])

  const refreshProfile = useCallback(async (knownUser) => {
    let user = knownUser
    if (user === undefined) {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        if (mountedRef.current) setAuthState({ status: 'error', user: null, profile: null, error })
        return null
      }
      user = session?.user || null
    }
    return loadProfile(user)
  }, [loadProfile])

  const ensureSessionPersistence = useCallback(() => {
    if (!persistenceCheckRef.current) {
      persistenceCheckRef.current = (async () => {
        const rememberMe = localStorage.getItem('losslens_remember_me') !== 'false'
        const hasSessionMarker = sessionStorage.getItem('losslens_session_login') === '1'
        if (!rememberMe && !hasSessionMarker) {
          const { error } = await supabase.auth.signOut({ scope: 'local' })
          clearSupabaseStorage(localStorage)
          clearSupabaseStorage(sessionStorage)
          if (error) throw error
        }
      })()
    }
    return persistenceCheckRef.current
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let active = true
    let subscription

    const bootstrap = async () => {
      try {
        await ensureSessionPersistence()
        if (!active) return
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          void loadProfile(session?.user || null)
        })
        subscription = authSubscription
        await refreshProfile()
      } catch (error) {
        if (active) {
          console.error('Could not initialize the authentication session:', error)
          setAuthState({ status: 'error', user: null, profile: null, error })
        }
      }
    }
    void bootstrap()

    const refreshOnFocus = () => {
      if (subscription) void refreshProfile()
    }
    const refreshInterval = window.setInterval(refreshOnFocus, 5 * 60 * 1000)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      active = false
      mountedRef.current = false
      requestIdRef.current += 1
      subscription?.unsubscribe()
      window.removeEventListener('focus', refreshOnFocus)
      window.clearInterval(refreshInterval)
    }
  }, [ensureSessionPersistence, loadProfile, refreshProfile])

  const retryProfile = useCallback(() => { void refreshProfile() }, [refreshProfile])
  const value = useMemo(() => {
    const profile = authState.profile
    const username = profile?.username || authState.user?.user_metadata?.username || authState.user?.user_metadata?.full_name || null
    const avatarUrl = profile?.avatar_url || authState.user?.user_metadata?.avatar_url || null
    return {
      ...authState,
      authStatus: authState.status,
      loading: authState.status === 'loading',
      role: profile?.role || null,
      username,
      avatar_url: avatarUrl,
      avatarUrl,
      isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.is_super_admin === true,
      isSuperAdmin: profile?.role === 'super_admin' || profile?.is_super_admin === true,
      status: profile?.status || null,
      refreshProfile,
      retryProfile,
    }
  }, [authState, refreshProfile, retryProfile])

  return <AuthProfileContext.Provider value={value}>{children}</AuthProfileContext.Provider>
}

// The provider and its context hook are intentionally co-located.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthProfile() {
  const context = useContext(AuthProfileContext)
  if (!context) throw new Error('useAuthProfile must be used within AuthProfileProvider')
  return context
}
