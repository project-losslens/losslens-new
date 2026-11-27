import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const configuredOrigins = (value: string) => value.split(',').flatMap((entry) => {
  try {
    const url = new URL(entry.trim())
    return ['https:', 'http:'].includes(url.protocol) ? [url.origin] : []
  } catch {
    return []
  }
})

const [siteOrigin, ...additionalOrigins] = configuredOrigins(Deno.env.get('ALLOWED_ORIGIN') || '')
const allowedOrigins = new Set([siteOrigin, ...additionalOrigins])
const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] || char))

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (!siteOrigin) return new Response('Service unavailable', { status: 500, headers: { Vary: 'Origin' } })
  if (!origin || !allowedOrigins.has(origin)) return new Response('Forbidden', { status: 403, headers: { Vary: 'Origin' } })
  const headers = corsHeaders(origin)
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let action = 'unknown'
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return json(401, { error: 'Unauthorized' })
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: 'Service configuration is incomplete' })

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user: actor }, error: authError } = await caller.auth.getUser()
    if (authError && Number(authError.status) >= 500) return json(503, { error: 'Authentication service unavailable. Staff should check function project configuration.', code: 'auth_service_unavailable' })
    if (authError || !actor) return json(401, { error: 'Your session expired or could not be verified. Sign in again.', code: 'invalid_session' })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: actorProfile, error: roleError } = await admin.from('profiles')
      .select('role, status, must_change_password')
      .eq('id', actor.id)
      .single()
    const body = await req.json()
    action = typeof body.action === 'string' ? body.action : 'unknown'
    const targetId = typeof body.targetId === 'string' ? body.targetId : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const actions = new Set([
      'set-email', 'set-phone', 'send-reset-link', 'set-temporary-password',
      'set-role', 'set-profile', 'complete-temporary-password-change',
    ])
    if (!actions.has(action)) return json(400, { error: 'Unsupported action' })
    if (roleError) return json(503, { error: 'Current account authority could not be checked. Staff should verify the profiles schema and function project configuration.', code: 'authority_lookup_failed' })
    if (actorProfile?.status !== 'active' || (actorProfile?.must_change_password && action !== 'complete-temporary-password-change')
      || (action !== 'complete-temporary-password-change' && actorProfile?.role !== 'super_admin')) {
      return json(403, { error: 'Active super-admin access required' })
    }
    if (action !== 'set-role' && (reason.length > 500 || (action !== 'complete-temporary-password-change' && reason.length < 5))) {
      return json(400, { error: 'A reason of 5 to 500 characters is required' })
    }
    if (!targetId) return json(400, { error: 'Target account is required' })

    if (action !== 'complete-temporary-password-change') {
      const { data: allowed, error: rateError } = await admin.rpc('admin_check_user_update_rate_limit', {
        p_actor_id: actor.id,
        p_action: action === 'set-role' ? 'set-role-step-up' : action,
      })
      if (rateError) return json(503, { error: 'Account service database is not ready. Staff must apply the account-workflow migration and deploy admin-user-update.', code: 'database_dependency' })
      if (!allowed) return json(429, { error: 'Too many account-management attempts. Try again later.' })
    }

    const { data: targetProfile, error: targetProfileError } = await admin.from('profiles')
      .select('id, role, status, username, email, phone, must_change_password')
      .eq('id', targetId)
      .single()
    if (targetProfileError || !targetProfile) return json(404, { error: 'Target account not found' })
    const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetId)
    if (targetAuthError && [401,403].includes(Number(targetAuthError.status))) return json(503, { error: 'Server credentials cannot read the target account. Staff should verify the function service key and project.', code: 'server_credentials' })
    if (targetAuthError || !targetAuth.user) return json(404, { error: 'Target account not found' })

    if (action === 'complete-temporary-password-change') {
      if (actor.id !== targetId || !targetProfile.must_change_password) {
        return json(403, { error: 'No temporary password change is pending for this account' })
      }
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (password.length < 12 || password === currentPassword) {
        return json(400, { error: 'Choose a new password with at least 12 characters' })
      }
      const verifier = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
        email: targetAuth.user.email || '',
        password: currentPassword,
      })
      if (verifyError || verified.user?.id !== actor.id) return json(403, { error: 'Password verification failed' })
      const { error: passwordError } = await admin.auth.admin.updateUserById(actor.id, { password })
      if (passwordError) return json(500, { error: 'New password could not be saved' })
      const { error: flagError } = await admin.from('profiles')
        .update({ must_change_password: false })
        .eq('id', actor.id)
      if (flagError) return json(500, { error: 'Password changed, but the access lock remains; contact support' })
      const { error: auditError } = await admin.from('audit_logs').insert({
        actor_id: actor.id, action: 'admin_temporary_password_changed',
        target_table: 'profiles', target_id: actor.id,
        metadata: { reason: 'Temporary password replaced by account owner' },
      })
      if (auditError) return json(500, { error: 'Password changed, but audit recording failed; contact support' })
      const { error: revokeError } = await admin.rpc('admin_revoke_user_sessions', { p_user_id: actor.id })
      if (revokeError) return json(500, { error: 'Password changed, but session revocation failed; contact support' })
      return json(200, { success: true })
    }

    const expectedConfirmation = targetProfile.username || targetProfile.email || targetId
    if (action !== 'set-role' && (typeof body.typedConfirmation !== 'string' || body.typedConfirmation.trim() !== expectedConfirmation)) {
      return json(400, { error: 'Typed confirmation does not match the target account' })
    }

    const requiresStepUp = true
    if (requiresStepUp) {
      const ownPassword = typeof body.ownPassword === 'string' ? body.ownPassword : ''
      if (!ownPassword) return json(400, { error: 'Your current password is required' })
      const verifier = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const credentials = actor.email ? { email: actor.email, password: ownPassword } : { phone: actor.phone || '', password: ownPassword }
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword(credentials)
      if (verifyError || verified.user?.id !== actor.id) return json(403, { error: 'Your password was not accepted. Enter your own super-admin password.', code: 'incorrect_password' })
      await verifier.auth.signOut({ scope: 'local' })
    }

    const protectedTarget = targetProfile.role === 'super_admin' || targetId === actor.id
    if (protectedTarget && !['send-reset-link', 'set-role', 'set-profile'].includes(action)) {
      return json(403, { error: 'Credentials cannot be changed for yourself or another super-admin' })
    }
    if (protectedTarget && action === 'set-profile' && typeof body.phone === 'string') {
      return json(403, { error: 'Phone cannot be changed for yourself or another super-admin' })
    }

    if (action === 'set-profile' || action === 'set-phone') {
      const { error: authorizationError } = await admin.rpc('admin_authorize_user_update', {
        p_actor_id: actor.id,
        p_target_id: targetId,
        p_action: 'profile-update',
      })
      if (authorizationError) return json(500, { error: 'Could not authorize the profile update' })
    }

    if (action === 'set-role') {
      if (targetId === actor.id) return json(403, { error: 'You cannot change your own role' })
      const { newRole, insurerId, acknowledgeOpenWork, reassignmentTherapistId } = body
      if (!['user','admin','super_admin','therapist','insurer'].includes(newRole)) return json(400, { error: 'Select a permitted role' })
      if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)) return json(400, { error: 'A role-change request ID is required' })
      // The token was verified by getUser above. Never accept actor/claims from the body.
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (actor.factors?.some((factor) => factor.status === 'verified') && claims.aal !== 'aal2') {
        return json(403, { error: 'Complete your MFA challenge before changing roles.', code: 'mfa_required' })
      }
      const { data: changed, error: roleChangeError } = await admin.rpc('service_change_account_role', {
        p_actor_id: actor.id,
        p_target_id: targetId,
        p_new_role: newRole,
        p_expected_role: body.expectedRole,
        p_request_id: body.requestId,
        p_claims: claims,
        p_insurer_id: insurerId || null,
        p_acknowledge_open_work: acknowledgeOpenWork === true,
        p_reassign_to: reassignmentTherapistId || null,
      })
      if (roleChangeError) return json(roleChangeError.code === 'PGRST202' || roleChangeError.code === '42883' ? 503 : 409, { error: ['PGRST202','42883'].includes(roleChangeError.code || '') ? 'The role-change migration is missing. Staff must apply 20261125000011_account_protection_workflows.sql and redeploy this function.' : roleChangeError.message, code: roleChangeError.code })
      return json(200, { success: true, ...changed })
    }

    if (action === 'set-profile') {
      const { error: profileError } = await caller.rpc('admin_update_profile_fields', {
        p_user_id: targetId,
        p_username: typeof body.username === 'string' ? body.username : null,
        p_full_name: typeof body.fullName === 'string' ? body.fullName : null,
        p_phone: typeof body.phone === 'string' ? body.phone : null,
        p_reason: reason,
      })
      if (profileError) return json(400, { error: profileError.message })
      return json(200, { success: true })
    }

    if (action === 'set-phone') {
      const { error: phoneError } = await caller.rpc('admin_update_profile_fields', {
        p_user_id: targetId, p_username: null, p_full_name: null,
        p_phone: typeof body.phone === 'string' ? body.phone : '',
        p_reason: reason,
      })
      if (phoneError) return json(400, { error: phoneError.message })
      return json(200, { success: true })
    }

    if (action === 'send-reset-link') {
      const redirectTo = `${siteOrigin}/reset-password`
      const { error: resetError } = await admin.auth.resetPasswordForEmail(
        targetAuth.user.email || '',
        { redirectTo },
      )
      if (resetError) return json(502, { error: 'Password reset link could not be sent' })
      const { error: auditError } = await admin.from('audit_logs').insert({
        actor_id: actor.id, action: 'admin_reset_link_sent', target_table: 'profiles',
        target_id: targetId, metadata: { reason },
      })
      if (auditError) return json(500, { error: 'Reset link sent, but audit recording failed; contact support' })
      return json(200, { success: true })
    }

    if (action === 'set-email') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json(400, { error: 'Enter a valid email address' })
      }
      const oldEmail = targetAuth.user.email || ''
      if (!oldEmail || oldEmail.toLowerCase() === email) return json(400, { error: 'New email must differ from the current email' })
      const resendKey = Deno.env.get('RESEND_API_KEY') || ''
      const emailFrom = Deno.env.get('EMAIL_FROM') || ''
      if (!resendKey || !emailFrom) return json(503, { error: 'Email notices are not configured; no changes were made' })

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetId, {
        email, email_confirm: true,
      })
      if (authUpdateError) return json(400, { error: 'Auth email could not be updated' })
      const { error: profileUpdateError } = await admin.from('profiles').update({ email }).eq('id', targetId)
      if (profileUpdateError) {
        const { error: compensationError } = await admin.auth.admin.updateUserById(targetId, {
          email: oldEmail, email_confirm: true,
        })
        const { error: auditError } = await admin.from('audit_logs').insert({
          actor_id: actor.id, action: 'admin_email_update_failed', target_table: 'profiles',
          target_id: targetId,
          metadata: {
            reason,
            old_email: `${oldEmail.slice(0, 1)}***@${oldEmail.split('@')[1] || '***'}`,
            requested_email: `${email.slice(0, 1)}***@${email.split('@')[1] || '***'}`,
            compensation_succeeded: !compensationError,
          },
        })
        return json(500, { error: compensationError
          ? 'Email sync and compensation failed; support intervention is required'
          : auditError
            ? 'Email profile update failed, the auth email was restored, and audit recording failed'
            : 'Email profile update failed; the auth email was restored' })
      }

      const notice = async (to: string, label: string) => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: emailFrom, to: [to], subject: 'LossLens account email updated',
            html: `<p>The email address for a LossLens account was changed by an administrator.</p><p>${escapeHtml(label)}</p><p>If you did not expect this change, contact LossLens support immediately.</p>`,
          }),
        })
        return response.ok
      }
      const noticeResults = await Promise.allSettled([
        notice(oldEmail, 'This message was sent to the previous address.'),
        notice(email, 'This message was sent to the new address.'),
      ])
      const oldNoticeSent = noticeResults[0].status === 'fulfilled' && noticeResults[0].value
      const newNoticeSent = noticeResults[1].status === 'fulfilled' && noticeResults[1].value

      const { error: revokeError } = await admin.rpc('admin_revoke_user_sessions', { p_user_id: targetId })
      const { error: auditError } = await admin.from('audit_logs').insert({
        actor_id: actor.id, action: 'admin_email_updated', target_table: 'profiles', target_id: targetId,
        metadata: {
          reason,
          old_email: `${oldEmail.slice(0, 1)}***@${oldEmail.split('@')[1] || '***'}`,
          new_email: `${email.slice(0, 1)}***@${email.split('@')[1] || '***'}`,
          old_notice_sent: oldNoticeSent,
          new_notice_sent: newNoticeSent,
          sessions_revoked: !revokeError,
        },
      })
      if (auditError) return json(500, { error: 'Email changed, but audit recording failed; contact support' })
      if (revokeError) return json(500, { error: 'Email changed and notices attempted, but session revocation failed; contact support' })
      if (!oldNoticeSent || !newNoticeSent) {
        return json(502, { error: 'Email changed and sessions revoked, but one or more notices could not be delivered; review the audit log' })
      }
      return json(200, { success: true })
    }

    if (action === 'set-temporary-password') {
      const random = new Uint8Array(24)
      crypto.getRandomValues(random)
      const temporaryPassword = Array.from(random, (value) => value.toString(16).padStart(2, '0')).join('') + 'aA1!'
      const { error: flagError } = await admin.from('profiles')
        .update({ must_change_password: true }).eq('id', targetId)
      if (flagError) return json(500, { error: 'Could not set the forced-change flag; no password was changed' })
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, {
        password: temporaryPassword,
      })
      if (passwordError) {
        const { error: flagResetError } = await admin.from('profiles')
          .update({ must_change_password: false }).eq('id', targetId)
        return json(500, { error: flagResetError
          ? 'Temporary password failed and the access lock could not be cleared; contact support'
          : 'Temporary password could not be set' })
      }
      const { error: auditError } = await admin.from('audit_logs').insert({
        actor_id: actor.id, action: 'admin_temporary_password_set', target_table: 'profiles',
        target_id: targetId, metadata: { reason, must_change_password: true },
      })
      const { error: revokeError } = await admin.rpc('admin_revoke_user_sessions', { p_user_id: targetId })
      if (auditError || revokeError) {
        return json(500, {
          error: auditError
            ? 'Password set, but audit recording failed; contact support'
            : 'Password set, but session revocation failed; contact support',
          temporaryPassword,
        })
      }
      return json(200, { success: true, temporaryPassword })
    }

    return json(400, { error: 'Unsupported action' })
  } catch {
    console.error('Admin user update failed', { action })
    return json(500, { error: 'Account update failed; no sensitive values were logged' })
  }
})
