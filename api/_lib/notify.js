//  Notifications adapter — in-app notification plus pluggable email/SMS
//  channels. Defaults are no-ops for external channels. NEVER include
//  clinical or diary content in any payload.

export async function notify({ userId, type, title, body, channels = ['in_app'] }) {
  const results = {}

  if (channels.includes('in_app')) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
      const { error } = await db.from('notifications').insert({
        user_id: userId,
        type,
        title,
        message: body,
      })
      results.in_app = error ? { ok: false, error: error.message } : { ok: true }
    } catch (err) {
      results.in_app = { ok: false, error: err.message }
    }
  }

  if (channels.includes('email')) {
    // Pluggable: wire an ESP (e.g. Resend/SendGrid) via env when ready.
    results.email = process.env.EMAIL_PROVIDER
      ? await sendEmail(userId, title, body)
      : { ok: false, skipped: 'no provider configured' }
  }

  if (channels.includes('sms')) {
    results.sms = process.env.SMS_PROVIDER
      ? await sendSms(userId, body)
      : { ok: false, skipped: 'no provider configured' }
  }

  return results
}

async function sendEmail() {
  return { ok: false, skipped: 'email provider not implemented' }
}

async function sendSms() {
  return { ok: false, skipped: 'sms provider not implemented' }
}
