import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  )
}

export function clearSupabaseStorage(storage) {
  if (!storage || typeof storage !== 'object') return
  for (const key of Array.from({ length: storage.length }, (_, index) => storage.key(index))) {
    if (key && key.startsWith('sb-')) storage.removeItem(key)
  }
}

export function clearAuthStorage() {
  clearSupabaseStorage(localStorage)
  clearSupabaseStorage(sessionStorage)
  localStorage.removeItem('losslens_remember_me')
  sessionStorage.removeItem('losslens_session_login')
}

export async function resetAuthBeforeSignIn(rememberMe = true) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    clearSupabaseStorage(localStorage)
    clearSupabaseStorage(sessionStorage)
    throw sessionError
  }
  let signOutError = null
  if (session) {
    const result = await supabase.auth.signOut({ scope: 'local' })
    signOutError = result.error
  }
  clearSupabaseStorage(localStorage)
  clearSupabaseStorage(sessionStorage)
  if (signOutError) throw signOutError
  localStorage.setItem('losslens_remember_me', String(rememberMe))
  if (rememberMe) sessionStorage.removeItem('losslens_session_login')
  else sessionStorage.setItem('losslens_session_login', '1')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
