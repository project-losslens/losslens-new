import { supabase } from './supabase'

const ADJECTIVES = ['Brave', 'Calm', 'Kind', 'Bright', 'Steady', 'Quiet', 'Clear', 'Bold']
const ANIMALS = ['Otter', 'Falcon', 'Lion', 'Dolphin', 'Eagle', 'Panda', 'Fox', 'Wolf']

export async function ensureCircleHash(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('circle_user_hash, circle_display_name')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Failed to fetch profile for circle hash:', error)
    throw error
  }

  if (profile?.circle_user_hash) return profile.circle_user_hash

  const raw = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
  const shortHash = String(raw).replace(/-/g, '').slice(0, 12)
  const displayName = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      circle_user_hash: shortHash,
      circle_display_name: displayName,
    })
    .eq('id', userId)

  if (updateError) {
    console.error('Failed to set circle hash:', updateError)
    throw updateError
  }

  return shortHash
}
