import { supabase } from './supabase'

//  protection_mode from system_settings: concept | pilot | live.
//  concept = feature hidden exactly as before. Cached per session.
let cached = null

export async function getProtectionMode() {
  if (cached) return cached
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'protection_mode').maybeSingle()
    const v = data?.value
    cached = typeof v === 'string' ? v.replace(/"/g, '') : (v?.mode || 'concept')
  } catch {
    cached = 'concept'
  }
  return cached
}

export function protectionModeAllows(mode) {
  return mode === 'pilot' || mode === 'live'
}
