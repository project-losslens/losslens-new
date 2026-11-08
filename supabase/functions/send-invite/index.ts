import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': allowedOrigin || '',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (!allowedOrigin) return new Response('Service unavailable', { status: 500 })
  if (origin !== allowedOrigin) return new Response('Forbidden', { status: 403 })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return json(401, { error: 'Unauthorized' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error('Invite service is missing required Supabase configuration')
      return json(500, { error: 'This action is temporarily unavailable' })
    }

    // Verify the caller.
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json(401, { error: 'Invalid token' })

    // Privileged actions require a fresh sign-in (JWT iat within 15 minutes).
    try {
      const payload = JSON.parse(atob(authHeader.replace(/^Bearer\s+/i, '').split('.')[1] || ''))
      const iat = Number(payload?.iat)
      if (!Number.isFinite(iat) || Date.now() / 1000 - iat > 900) {
        return json(403, { error: 'Recent sign-in required. Please sign out and back in.' })
      }
    } catch {
      return json(403, { error: 'Recent sign-in required. Please sign out and back in.' })
    }

    const { data: callerProfile, error: callerProfileError } = await caller
      .from('profiles').select('role, is_super_admin').eq('id', user.id).single()
    if (callerProfileError || !callerProfile) {
      console.error('Invite caller role lookup failed:', callerProfileError)
      return json(403, { error: 'Unable to verify caller role' })
    }
    // All privileged actions require super_admin.
    const callerIsSuperAdmin = callerProfile.role === 'super_admin' || callerProfile.is_super_admin === true
    if (!callerIsSuperAdmin) {
      return json(403, { error: 'Forbidden - Super admin only' })
    }
    const roleRank: Record<string, number> = { user: 0, therapist: 1, insurer: 1, admin: 2, super_admin: 3 }
    const mayViewTarget = async (targetId: string) => {
      const { data: targetProfile, error } = await caller
        .from('profiles').select('role, is_super_admin').eq('id', targetId).single()
      if (error || !targetProfile) return false
      const targetRole = targetProfile.is_super_admin ? 'super_admin' : targetProfile.role
      const targetRank = roleRank[targetRole]
      const callerRole = callerProfile.is_super_admin ? 'super_admin' : callerProfile.role
      const callerRank = roleRank[callerRole]
      return targetRank !== undefined && callerRank !== undefined && targetRank < callerRank
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const { action, email, userId } = body

    // ── invite ──
    if (action === 'invite' || (!action && email)) {
      if (!email) return json(400, { error: 'Email required' })
      const inviteRole = body.role || 'user'
      if (!['user', 'therapist', 'insurer'].includes(inviteRole)) {
        return json(400, { error: 'Invite role must be user, therapist, or insurer' })
      }
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role: inviteRole },
      })
      if (error) {
        console.error('Invite email provider failed:', error)
        return json(502, { error: 'Invite could not be sent' })
      }
      if (data.user?.id && inviteRole === 'therapist') {
        const { error: promotionError } = await caller.rpc('admin_promote_therapist', { p_user_id: data.user.id })
        if (promotionError) {
          console.error('Therapist profile provisioning failed:', promotionError)
          return json(500, { error: 'Invite could not be completed' })
        }
      } else if (data.user?.id && inviteRole === 'insurer') {
        const { error: profileError } = await supabaseAdmin.from('profiles')
          .update({ role: 'insurer' }).eq('id', data.user.id)
        if (profileError) {
          console.error('Insurer profile provisioning failed:', profileError)
          return json(500, { error: 'Invite could not be completed' })
        }
      }
      if (data.user?.id) {
        const { error: auditError } = await caller.rpc('log_admin_action', {
          p_action: 'user_invited',
          p_target_table: 'profiles',
          p_target_id: data.user.id,
          p_metadata: { role: inviteRole },
        })
        if (auditError) console.error('Invite audit log failed:', auditError)
      }
      return json(200, { success: true, message: `Invite sent to ${email}`, userId: data.user?.id })
    }

    // ── reset-password: send a recovery link instead of setting a password ──
    if (action === 'reset-password') {
      if (!userId) return json(400, { error: 'userId required' })
      const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (targetError || !target?.user?.email) {
        console.error('Password reset target lookup failed:', targetError)
        return json(400, { error: 'User not found' })
      }
      if (!await mayViewTarget(userId)) return json(403, { error: 'Cannot reset a peer or higher-privileged account' })
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(target.user.email, {
        redirectTo: `${allowedOrigin}/reset-password`,
      })
      if (error) {
        console.error('Password reset email could not be sent:', error)
        return json(502, { error: 'Password reset could not be sent' })
      }
      const { error: auditError } = await caller.rpc('log_admin_action', {
        p_action: 'reset_password_sent', p_target_table: 'profiles',
        p_target_id: userId, p_metadata: {},
      })
      if (auditError) console.error('Password reset audit log failed:', auditError)
      return json(200, { success: true, message: 'Password reset link sent' })
    }

    // ── get-email ──
    if (action === 'get-email') {
      if (!userId) return json(400, { error: 'userId required' })
      if (!await mayViewTarget(userId)) return json(403, { error: 'Cannot view a peer or higher-privileged account' })
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (error) {
        console.error('User email lookup failed:', error)
        return json(502, { error: 'Email could not be retrieved' })
      }
      const { error: auditError } = await caller.rpc('log_admin_action', {
        p_action: 'view_user_email', p_target_table: 'profiles',
        p_target_id: userId, p_metadata: {},
      })
      if (auditError) console.error('Email lookup audit log failed:', auditError)
      return json(200, { success: true, email: data?.user?.email || null })
    }

    return json(400, { error: 'Unknown action. Use: invite, reset-password, or get-email' })
  } catch (error) {
    console.error('Invite operation failed:', error)
    return json(500, { error: 'The requested action could not be completed' })
  }
})
