import { createSupabaseClient } from './supabaseClient'

const rememberMe = localStorage.getItem('losslens_remember_me') !== 'false'
export const supabase = createSupabaseClient(rememberMe)
