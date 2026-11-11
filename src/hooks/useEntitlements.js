import { useMemo } from 'react'
import { supabase } from './supabase'
import { useState, useEffect } from 'react'
import { effectivePlan, getEntitlements } from './entitlements'

//  Loads the current user's subscription fields and derives entitlements.
//  Falls back to free when there is no session or the row is missing.
export function useEntitlements() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { if (!cancelled) setLoading(false); return }
        const { data } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status, subscription_expires_at, plan_type')
          .eq('id', session.user.id)
          .single()
        if (!cancelled) setProfile(data || null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return useMemo(() => ({
    profile,
    loading,
    plan: effectivePlan(profile),
    entitlements: getEntitlements(profile),
  }), [profile, loading])
}
