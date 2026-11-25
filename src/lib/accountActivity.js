import { supabase } from './supabase'

export function recordAccountActivity(signingOut = false) {
  return supabase.rpc('record_account_activity', { p_signing_out: signingOut }).abortSignal(AbortSignal.timeout(2000))
}
