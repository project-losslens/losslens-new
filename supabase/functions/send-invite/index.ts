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
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const { action, email } = body

    // ── invite ──
    if (action === 'invite' || (!action && email)) {
      if (!email) return json(400, { error: 'Email required' })
      const inviteRole = body.role || 'user'
      if (!['user', 'therapist'].includes(inviteRole)) {
        return json(400, { error: 'Invite role must be user or therapist. Link insurer accounts to an approved organisation first.' })
      }
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role: inviteRole },
      })
      if (error) {
        console.error('Invite email provider failed:', error)
        return json(502, { error: 'Invite could not be sent' })
      }
      if (data.user?.id && inviteRole === 'therapist') {
        const { error: promotionError } = await caller.rpc('admin_set_role', {
          p_user_id: data.user.id,
          p_new_role: 'therapist',
          p_reason: 'Therapist invitation created by super-admin',
        })
        if (promotionError) {
          console.error('Therapist profile provisioning failed:', promotionError)
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

    return json(400, { error: 'Unknown action. Use invite.' })
  } catch (error) {
    console.error('Invite operation failed:', error)
    return json(500, { error: 'The requested action could not be completed' })
  }
})
