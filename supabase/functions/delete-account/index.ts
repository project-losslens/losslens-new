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

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json(req, 401, { error: 'Invalid token' })

    const body = await req.json().catch(() => ({}))
    const { action, userId } = body

    // Allow self-delete, or super-admin deleting another user.
    let targetId = user?.id
    if (action === 'admin-delete' || (userId && userId !== user.id)) {
      const { data: callerProfile } = await caller
        .from('profiles').select('role, is_super_admin').eq('id', user.id).single()
      const isSuper = callerProfile?.role === 'super_admin' || callerProfile?.is_super_admin === true
      if (!isSuper) return json(req, 403, { error: 'Forbidden' })
      targetId = userId
    }
    if (!targetId) return json(req, 400, { error: 'userId required' })

    const admin = createClient(supabaseUrl, serviceKey)

    // Delete storage objects under the user's folders.
    for (const bucket of ['avatars', 'mirror-recordings', 'precious-pacts']) {
      const { data: files } = await admin.storage.from(bucket).list(targetId, { limit: 1000 })
      if (files?.length) {
        await admin.storage.from(bucket).remove(files.map((f) => `${targetId}/${f.name}`))
      }
    }

    // Anonymise hash-keyed rows (circle/whispers use opaque hashes, not uids,
    // so memberships keyed by hash are left to expire; messages keep content
    // but lose the profile link via FK cascade below).
    await admin.from('supporter_invitations').delete().eq('user_id', targetId)
    await admin.from('notifications').delete().eq('user_id', targetId)

    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId)
    if (deleteError) return json(req, 400, { error: deleteError.message })

    return json(req, 200, { success: true })
  } catch (error) {
    return json(req, 500, { error: error.message })
  }
})
