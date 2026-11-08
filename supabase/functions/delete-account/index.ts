import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': allowedOrigin || '',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

const json = (status: number, body: Record<string, unknown>) =>
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
      console.error('Account deletion is missing required Supabase configuration')
      return json(500, { error: 'Account deletion is temporarily unavailable' })
    }

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json(401, { error: 'Unauthorized' })

    // Destructive actions require a fresh sign-in (JWT iat within 15 minutes).
    try {
      const payload = JSON.parse(atob(authHeader.replace(/^Bearer\s+/i, '').split('.')[1] || ''))
      const iat = Number(payload?.iat)
      if (!Number.isFinite(iat) || Date.now() / 1000 - iat > 900) {
        return json(403, { error: 'Recent sign-in required. Please sign out and back in.' })
      }
    } catch {
      return json(403, { error: 'Recent sign-in required. Please sign out and back in.' })
    }

    const body = await req.json().catch(() => ({}))
    const { action, userId } = body
    let targetId = user.id
    if (action === 'admin-delete' || (userId && userId !== user.id)) {
      const { data: callerProfile, error: profileError } = await caller
        .from('profiles').select('role, is_super_admin').eq('id', user.id).single()
      if (profileError || !callerProfile) {
        console.error('Account deletion caller role lookup failed:', profileError)
        return json(403, { error: 'Forbidden' })
      }
      if (callerProfile.role !== 'super_admin' && callerProfile.is_super_admin !== true) {
        return json(403, { error: 'Forbidden' })
      }
      targetId = userId
    }
    if (!targetId) return json(400, { error: 'User ID required' })

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: targetError } = await admin
      .from('profiles').select('circle_user_hash').eq('id', targetId).maybeSingle()
    if (targetError) throw targetError
    const userHash = profile?.circle_user_hash

    const runStep = async (step: string, operation: () => Promise<void>) => {
      const { data: logEntry, error: startError } = await admin
        .from('account_deletion_log')
        .insert({ user_id: targetId, step, status: 'started' })
        .select('id')
        .single()
      if (startError) throw startError
      try {
        await operation()
        const { error: completeError } = await admin
          .from('account_deletion_log')
          .update({ status: 'completed' })
          .eq('id', logEntry.id)
        if (completeError) throw completeError
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        const { error: logError } = await admin
          .from('account_deletion_log')
          .update({ status: 'failed', error: detail.slice(0, 1000) })
          .eq('id', logEntry.id)
        if (logError) console.error('Could not write account deletion failure log:', logError)
        throw error
      }
    }

    const listFiles = async (bucket: string, folder: string, output: string[]) => {
      let offset = 0
      while (true) {
        const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
        if (error) throw error
        const entries = data || []
        for (const entry of entries) {
          const path = folder ? `${folder}/${entry.name}` : entry.name
          if (entry.id === null) await listFiles(bucket, path, output)
          else output.push(path)
        }
        if (entries.length < 1000) break
        offset += entries.length
      }
    }

    for (const bucket of ['avatars', 'mirror-recordings', 'precious-pacts', 'therapist-documents']) {
      await runStep(`storage:${bucket}`, async () => {
        const paths: string[] = []
        await listFiles(bucket, targetId, paths)
        for (let index = 0; index < paths.length; index += 100) {
          const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100))
          if (error) throw error
        }
      })
    }

    const deleteByUser = async (table: string) => {
      const { error } = await admin.from(table).delete().eq('user_id', targetId)
      if (error) throw error
    }
    for (const table of [
      'diary_entries', 'cbt_progress', 'chat_history', 'mirror_recordings',
      'precious_pacts', 'event_rsvps', 'event_discussions', 'notifications',
    ]) {
      await runStep(`delete:${table}`, () => deleteByUser(table))
    }

    await runStep('delete:supporter_messages', async () => {
      const { data: invitations, error: invitationError } = await admin
        .from('supporter_invitations').select('id').eq('user_id', targetId)
      if (invitationError) throw invitationError
      const invitationIds = (invitations || []).map((invitation) => invitation.id)
      if (invitationIds.length) {
        const { error } = await admin.from('supporter_messages').delete().in('invitation_id', invitationIds)
        if (error) throw error
      }
    })
    await runStep('delete:supporter_invitations', () => deleteByUser('supporter_invitations'))

    if (userHash) {
      await runStep('delete:circle_memberships', async () => {
        const { error } = await admin.from('circle_room_members').delete().eq('user_hash', userHash)
        if (error) throw error
      })
      await runStep('delete:circle_messages', async () => {
        const { error: mentionError } = await admin.from('circle_messages')
          .update({ mentioned_user_id: null })
          .eq('mentioned_user_id', targetId)
        if (mentionError) throw mentionError
        const { error: messageError } = await admin.from('circle_messages').delete().eq('user_hash', userHash)
        if (messageError) throw messageError
      })
      await runStep('delete:whispers_messages', async () => {
        const { error } = await admin.from('whispers_messages').delete().eq('sender_hash', userHash)
        if (error) throw error
      })
      await runStep('delete:whispers_matches', async () => {
        const { error } = await admin.from('whispers_matches')
          .delete().or(`user1_hash.eq.${userHash},user2_hash.eq.${userHash}`)
        if (error) throw error
      })
    }

    await runStep('anonymize:crisis_alerts', async () => {
      const { error } = await admin.from('crisis_alerts')
        .update({ message: '[deleted]', message_context: '[deleted]', user_id: null })
        .eq('user_id', targetId)
      if (error) throw error
    })
    await runStep('anonymize:provider_claims', async () => {
      const { error } = await admin.from('provider_claims').update({ therapist_id: null }).eq('therapist_id', targetId)
      if (error) throw error
    })
    await runStep('anonymize:provider_vouchers', async () => {
      const { error } = await admin.from('provider_vouchers').update({ user_id: null }).eq('user_id', targetId)
      if (error) throw error
    })
    await runStep('delete:pre_auth_vouchers', async () => {
      const { error } = await admin.from('pre_auth_vouchers').delete().eq('user_id', targetId)
      if (error) throw error
    })
    await runStep('soft-delete:therapist', async () => {
      const { error } = await admin.from('therapists')
        .update({ status: 'deleted', license_number: null, license_document_path: null })
        .eq('id', targetId)
      if (error) throw error
    })
    await runStep('anonymize:insurer', async () => {
      const { error } = await admin.from('insurers').update({ profile_id: null }).eq('profile_id', targetId)
      if (error) throw error
    })

    await runStep('delete:auth_user', async () => {
      const { error } = await admin.auth.admin.deleteUser(targetId)
      if (error) throw error
    })
    return json(200, { success: true })
  } catch (error) {
    console.error('Account deletion failed:', error)
    return json(500, { error: 'Account deletion could not be completed. Contact support before retrying.' })
  }
})
