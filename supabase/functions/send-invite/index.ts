import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = (req) => ({
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

const json = (req, status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return json(req, 401, { error: 'Unauthorized' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(req, 500, { error: 'Server misconfigured' })
    }

    // Verify the caller.
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json(req, 401, { error: 'Invalid token' })

    const { data: callerProfile } = await caller
      .from('profiles').select('role').eq('id', user.id).single()
    // All privileged actions require super_admin.
    if (callerProfile?.role !== 'super_admin' && callerProfile?.is_super_admin !== true) {
      return json(req, 403, { error: 'Forbidden - Super admin only' })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const { action, email, userId } = body

    // ── invite ──
    if (action === 'invite' || (!action && email)) {
      if (!email) return json(req, 400, { error: 'Email required' })
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role: body.role || 'user' },
      })
      if (error) return json(req, 400, { error: error.message })
      return json(req, 200, { success: true, message: `Invite sent to ${email}`, userId: data.user?.id })
    }

    // ── reset-password: send a recovery link instead of setting a password ──
    if (action === 'reset-password') {
      if (!userId) return json(req, 400, { error: 'userId required' })
      const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (targetError || !target?.user?.email) return json(req, 400, { error: 'User not found' })
      // Refuse to reset a peer-or-higher-privileged account.
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', userId).single()
      const rank = { user: 0, admin: 1, super_admin: 2 }
      if ((rank[targetProfile?.role] ?? 0) >= (rank[callerProfile.role] ?? 0) && callerProfile.role !== 'super_admin') {
        return json(req, 403, { error: 'Cannot reset a peer or higher-privileged account' })
      }
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(target.user.email, {
        redirectTo: `${Deno.env.get('ALLOWED_ORIGIN') || ''}/reset-password`,
      })
      if (error) return json(req, 400, { error: error.message })
      await caller.rpc('log_admin_action', {
        p_action: 'reset_password_sent', p_target_table: 'profiles',
        p_target_id: userId, p_metadata: {},
      }).then(() => {}).catch(() => {})
      return json(req, 200, { success: true, message: 'Password reset link sent' })
    }

    // ── get-email ──
    if (action === 'get-email') {
      if (!userId) return json(req, 400, { error: 'userId required' })
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (error) return json(req, 400, { error: error.message })
      await caller.rpc('log_admin_action', {
        p_action: 'view_user_email', p_target_table: 'profiles',
        p_target_id: userId, p_metadata: {},
      }).then(() => {}).catch(() => {})
      return json(req, 200, { success: true, email: data?.user?.email || null })
    }

    return json(req, 400, { error: 'Unknown action. Use: invite, reset-password, or get-email' })
  } catch (error) {
    return json(req, 500, { error: error.message })
  }
})
