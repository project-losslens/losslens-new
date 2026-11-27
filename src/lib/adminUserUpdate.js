import { supabase } from './supabase'

export async function invokeAdminUserUpdate(body) {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (error || !accessToken) {
    return { data: null, error: new Error('Your session expired or could not be verified. Sign in again.') }
  }

  const headers = { Authorization: `Bearer ${accessToken}` }
  if (import.meta.env.DEV) {
    return supabase.functions.invoke('admin-user-update', { headers, body })
  }

  const response = await fetch('/api/admin-user-update', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    return { data: null, error: Object.assign(new Error('Account update failed.'), { context: response }) }
  }
  const result = await response.json()
  return { data: result, error: null }
}
