import { supabase } from './supabase'

export async function invokeAdminUserUpdate(body) {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (error || !accessToken) {
    return { data: null, error: new Error('Your session expired or could not be verified. Sign in again.') }
  }

  return supabase.functions.invoke('admin-user-update', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
}
