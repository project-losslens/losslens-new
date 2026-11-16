/* global process */

// Oloo action registry — the only actions the assistant may propose.
// Every executor runs with the caller's own JWT, so PostgREST RLS and the
// security-definer member_* RPC authorization apply unchanged. Server-side
// param validation happens here; the LLM never touches SQL.
// Plain JS — Node-importable.

import { resolveOlooRoute } from '../../../src/config/olooRoutes.js'
import { PLAN_META, PLANS } from '../../../src/config/plans.js'
import { paymentsMode, startPremiumPayment } from '../payments.js'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './server.js'

const MAX_STR = 500
const MAX_NOTES = 2000

function rest(ctx, method, path, { body, prefer } = {}) {
  const headers = {
    apikey: ctx.supabaseKey,
    Authorization: `Bearer ${ctx.token}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  return fetchWithTimeout(`${ctx.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, REQUEST_TIMEOUT_MS).then(async (res) => {
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text || 'null') } catch { /* keep null */ }
    if (!res.ok) {
      const msg = Array.isArray(data) ? data[0]?.message : data?.message
      return { ok: false, status: res.status, error: msg || data?.hint || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  })
}

const rpc = (ctx, name, args = {}) => rest(ctx, 'POST', `rpc/${name}`, { body: args })

const str = (v, max = MAX_STR) => (typeof v === 'string' ? v.trim().slice(0, max) : null)
const strArr = (v, maxItems = 10) =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 80)).filter(Boolean).slice(0, maxItems) : []
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const dateStr = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : null)
const today = () => new Date().toISOString().slice(0, 10)

// ─── Diary ────────────────────────────────────────────────────────────────

async function diaryCreate(ctx, p) {
  const gambled = p.gambled
  if (typeof gambled !== 'boolean') return { ok: false, error: 'gambled must be true or false' }
  const payload = {
    user_id: ctx.userId,
    date: dateStr(p.date) || today(),
    gambled,
    mood: str(p.mood, 120) || null,
    triggers: strArr(p.triggers),
    coping: strArr(p.coping),
    notes: str(p.notes, MAX_NOTES) || null,
    gambling_type: str(p.gambling_type, 120) || null,
    money_spent: num(p.money_spent),
    money_won: num(p.money_won),
    time_spent: num(p.time_spent),
    urge_level: Number.isInteger(p.urge_level) && p.urge_level >= 1 && p.urge_level <= 10 ? p.urge_level : null,
  }
  const res = await rest(ctx, 'POST', 'diary_entries', {
    body: payload,
    prefer: 'resolution=merge-duplicates,return=representation',
  })
  if (!res.ok) return { ok: false, error: res.error }
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return {
    ok: true,
    summary: `Saved your diary entry for ${payload.date}: ${gambled ? 'you recorded gambling' : 'a clean day'}${payload.mood ? `, mood "${payload.mood}"` : ''}.`,
    data: { id: row?.id, date: payload.date, gambled: payload.gambled },
  }
}

async function diaryList(ctx, p) {
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 30)
  let path = `diary_entries?user_id=eq.${ctx.userId}&select=date,gambled,mood,triggers,coping,notes,gambling_type,money_spent,money_won,urge_level&order=date.desc&limit=${limit}`
  const from = dateStr(p.from); const to = dateStr(p.to)
  if (from) path += `&date=gte.${from}`
  if (to) path += `&date=lte.${to}`
  const res = await rest(ctx, 'GET', path)
  if (!res.ok) return { ok: false, error: res.error }
  const entries = Array.isArray(res.data) ? res.data : []
  const summary = entries.length
    ? `Found ${entries.length} diary entr${entries.length === 1 ? 'y' : 'ies'}${from || to ? ` between ${from || 'start'} and ${to || 'today'}` : ''}.`
    : 'No diary entries found for that period.'
  return { ok: true, summary, data: { entries } }
}

// ─── Events ───────────────────────────────────────────────────────────────

const EVENT_SELECT = 'id,title,description,date,location,type,spots,event_rsvps(attendance)'

function trimEvent(e) {
  if (!e) return null
  const rsvps = Array.isArray(e.event_rsvps) ? e.event_rsvps : []
  return {
    id: e.id, title: e.title, description: e.description || null,
    date: e.date, location: e.location || null, type: e.type || null,
    spots: e.spots ?? null,
    my_rsvp: rsvps[0]?.attendance || null,
  }
}

async function eventsList(ctx) {
  const res = await rest(ctx, 'GET', `events?active=eq.true&date=gte.${today()}&select=${EVENT_SELECT}&order=date.asc&limit=20`)
  if (!res.ok) return { ok: false, error: res.error }
  const events = (Array.isArray(res.data) ? res.data : []).map(trimEvent)
  return {
    ok: true,
    summary: events.length ? `${events.length} upcoming event${events.length === 1 ? '' : 's'} found.` : 'No upcoming events found.',
    data: { events },
  }
}

async function eventsGet(ctx, p) {
  const id = str(p.event_id, 64)
  let res
  if (id) {
    res = await rest(ctx, 'GET', `events?id=eq.${encodeURIComponent(id)}&select=${EVENT_SELECT}&limit=1`)
  } else {
    const title = str(p.title, 120)
    if (!title) return { ok: false, error: 'event_id or title is required' }
    res = await rest(ctx, 'GET', `events?active=eq.true&title=ilike.*${encodeURIComponent(title)}*&select=${EVENT_SELECT}&order=date.asc&limit=3`)
  }
  if (!res.ok) return { ok: false, error: res.error }
  const events = (Array.isArray(res.data) ? res.data : []).map(trimEvent)
  if (!events.length) return { ok: false, error: 'Event not found' }
  return { ok: true, summary: `Event: ${events[0].title} on ${events[0].date}${events[0].location ? ` at ${events[0].location}` : ''}.`, data: { events } }
}

async function eventsRegister(ctx, p) {
  const eventId = str(p.event_id, 64)
  if (!eventId) return { ok: false, error: 'event_id is required' }
  const attendance = ['going', 'maybe'].includes(p.attendance) ? p.attendance : 'going'

  const evRes = await rest(ctx, 'GET', `events?id=eq.${encodeURIComponent(eventId)}&active=eq.true&select=id,title,date,spots&limit=1`)
  if (!evRes.ok) return { ok: false, error: evRes.error }
  const event = Array.isArray(evRes.data) ? evRes.data[0] : null
  if (!event) return { ok: false, error: 'Event not found or inactive' }

  const existing = await rest(ctx, 'GET', `event_rsvps?user_id=eq.${ctx.userId}&event_id=eq.${encodeURIComponent(eventId)}&select=id,attendance&limit=1`)
  if (!existing.ok) return { ok: false, error: existing.error }
  const mine = Array.isArray(existing.data) ? existing.data[0] : null

  if (event.spots != null && attendance === 'going') {
    const countRes = await rest(ctx, 'GET', `event_rsvps?event_id=eq.${encodeURIComponent(eventId)}&attendance=eq.going&select=id`, { prefer: 'count=exact' })
    // count=exact returns rows; fall back to array length
    const going = Array.isArray(countRes.data) ? countRes.data.length : null
    if (going != null && going >= Number(event.spots) && !(mine && mine.attendance === 'going')) {
      return { ok: false, error: 'This event is full' }
    }
  }

  if (mine && mine.attendance === attendance) {
    return { ok: true, summary: `You're already registered for "${event.title}" (${attendance}).`, data: { event_id: eventId, attendance, already_registered: true } }
  }

  const write = mine
    ? await rest(ctx, 'PATCH', `event_rsvps?id=eq.${encodeURIComponent(mine.id)}`, { body: { attendance }, prefer: 'return=minimal' })
    : await rest(ctx, 'POST', 'event_rsvps', { body: { user_id: ctx.userId, event_id: eventId, attendance }, prefer: 'return=minimal' })
  if (!write.ok) return { ok: false, error: write.error }

  return {
    ok: true,
    summary: attendance === 'going'
      ? `You're registered for "${event.title}" on ${event.date}.`
      : `Marked as "maybe" for "${event.title}" on ${event.date}.`,
    data: { event_id: eventId, event_title: event.title, attendance, already_registered: false },
  }
}

async function eventsRegistrations(ctx) {
  const res = await rest(ctx, 'GET', `event_rsvps?user_id=eq.${ctx.userId}&select=attendance,events(id,title,date,location,spots)&order=created_at.desc&limit=20`)
  if (!res.ok) return { ok: false, error: res.error }
  const rows = Array.isArray(res.data) ? res.data : []
  const items = rows.map(r => ({
    event_id: r.events?.id, title: r.events?.title, date: r.events?.date,
    location: r.events?.location || null, spots: r.events?.spots ?? null, attendance: r.attendance,
  })).filter(i => i.event_id)
  return {
    ok: true,
    summary: items.length ? `You're registered for ${items.length} event${items.length === 1 ? '' : 's'}.` : "You haven't registered for any events yet.",
    data: { registrations: items },
  }
}

// ─── CBT / navigation / profile ───────────────────────────────────────────

async function cbtProgress(ctx) {
  const [prog, sessions] = await Promise.all([
    rest(ctx, 'GET', `cbt_progress?user_id=eq.${ctx.userId}&select=module_id,module_title,completed,completed_at&order=created_at.asc&limit=50`),
    rest(ctx, 'GET', `cbt_module_sessions?user_id=eq.${ctx.userId}&select=module_id,started_at,viewed_lessons&order=started_at.desc&limit=20`),
  ])
  if (!prog.ok) return { ok: false, error: prog.error }
  const modules = Array.isArray(prog.data) ? prog.data : []
  const done = modules.filter(m => m.completed)
  const inProgress = (Array.isArray(sessions.data) ? sessions.data : [])
    .filter(s => !done.some(d => String(d.module_id) === String(s.module_id)))
  return {
    ok: true,
    summary: `CBT progress: ${done.length} module${done.length === 1 ? '' : 's'} completed${inProgress.length ? `, ${inProgress.length} in progress` : ''}.`,
    data: { completed: done, in_progress: inProgress },
  }
}

function navigationOpen(ctx, p) {
  const route = resolveOlooRoute(str(p.route, 60))
  if (!route) return { ok: false, error: 'Unknown route' }
  return { ok: true, summary: `Opening ${route.label}.`, data: { navigate: route.path, label: route.label } }
}

async function profilePreferences(ctx) {
  const res = await rest(ctx, 'GET', `profiles?id=eq.${ctx.userId}&select=full_name,goal,risk_level,streak_days,money_saved,clean_since,onboarding_completed,preferences,subscription_plan,subscription_status,plan_type&limit=1`)
  if (!res.ok) return { ok: false, error: res.error }
  const p = Array.isArray(res.data) ? res.data[0] : null
  if (!p) return { ok: false, error: 'Profile not found' }
  const prefs = p.preferences && typeof p.preferences === 'object' ? p.preferences : {}
  return {
    ok: true,
    summary: `Profile: ${p.full_name || 'there'} — streak ${p.streak_days || 0} days, KES ${(p.money_saved || 0).toLocaleString('en-KE')} saved, plan ${p.subscription_plan || 'free'}.`,
    data: {
      full_name: p.full_name, goal: p.goal, risk_level: p.risk_level,
      streak_days: p.streak_days, money_saved: p.money_saved, clean_since: p.clean_since,
      language: prefs.language || null, onboarding_completed: p.onboarding_completed,
    },
  }
}

// ─── Protection ───────────────────────────────────────────────────────────

async function protectionRpc(ctx, name) {
  const res = await rpc(ctx, name)
  if (!res.ok) {
    // protection_require_mode raises when the programme is not in pilot/live.
    return { ok: true, summary: 'LossLens Protection is not currently enabled for your account, or enrolment details are unavailable. You can learn more on the Protection page or contact support.', data: { available: false } }
  }
  return { ok: true, data: res.data }
}

async function protectionStatus(ctx) {
  const res = await protectionRpc(ctx, 'member_list_my_protection')
  if (!res.ok || res.data?.available === false) return res
  const memberships = res.data?.memberships || []
  const active = memberships.find(m => m.status === 'active')
  return {
    ok: true,
    summary: active
      ? `You have an active LossLens Protection membership (ref ${active.member_reference || 'pending'}).`
      : memberships.length
        ? `You have ${memberships.length} Protection membership${memberships.length === 1 ? '' : 's'} — status: ${memberships.map(m => m.status).join(', ')}.`
        : 'You have no LossLens Protection membership yet.',
    data: res.data,
  }
}

async function protectionCover(ctx) {
  const res = await protectionRpc(ctx, 'member_list_my_cover')
  if (!res.ok || res.data?.available === false) return res
  const policies = res.data?.policies || []
  return {
    ok: true,
    summary: policies.length
      ? `Found ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} on your Protection cover.`
      : 'No active Protection policy found on your account.',
    data: res.data,
  }
}

async function protectionClaims(ctx) {
  const res = await rpc(ctx, 'member_list_my_claims')
  if (!res.ok) return { ok: false, error: res.error }
  const claims = Array.isArray(res.data) ? res.data : []
  return {
    ok: true,
    summary: claims.length
      ? `${claims.length} Protection claim${claims.length === 1 ? '' : 's'} found — latest status: ${claims[0].status}.`
      : 'No Protection claims found on your account.',
    data: { claims },
  }
}

// ─── Subscriptions ────────────────────────────────────────────────────────

async function subscriptionsStatus(ctx) {
  const [prof, pay] = await Promise.all([
    rest(ctx, 'GET', `profiles?id=eq.${ctx.userId}&select=subscription_plan,subscription_status,subscription_expires_at,plan_type&limit=1`),
    rest(ctx, 'GET', `payments?user_id=eq.${ctx.userId}&select=status,amount,currency,plan,created_at&order=created_at.desc&limit=1`),
  ])
  if (!prof.ok) return { ok: false, error: prof.error }
  const p = Array.isArray(prof.data) ? prof.data[0] : {}
  const latest = Array.isArray(pay.data) ? pay.data[0] : null
  const plan = p.plan_type === 'company' ? 'company' : (p.subscription_plan || 'free')
  return {
    ok: true,
    summary: `Your plan is ${plan} (${p.subscription_status || 'no status'}${p.subscription_expires_at ? `, expires ${String(p.subscription_expires_at).slice(0, 10)}` : ''}).${latest ? ` Latest payment: ${latest.status}, KES ${latest.amount}.` : ''}`,
    data: { plan, status: p.subscription_status, expires_at: p.subscription_expires_at, plan_type: p.plan_type, latest_payment: latest },
  }
}

function subscriptionsPlans() {
  const premiumKes = Number(process.env.PREMIUM_PRICE_KES)
  const plans = Object.values(PLANS).map(code => ({
    code,
    name: PLAN_META[code]?.name || code,
    price_kes: code === PLANS.PREMIUM && Number.isSafeInteger(premiumKes) && premiumKes > 0 ? premiumKes : (PLAN_META[code]?.priceKes ?? null),
    period: PLAN_META[code]?.period || 'month',
  }))
  return {
    ok: true,
    summary: `Plans: ${plans.map(p => `${p.name}${p.price_kes != null ? ` KES ${p.price_kes}` : ''}`).join(', ')}.`,
    data: { plans, payments_enabled: paymentsMode() !== 'off' },
  }
}

async function subscriptionsCheckout(ctx, p) {
  const phone = str(p.phone, 30)
  if (!phone) return { ok: false, error: 'A Kenyan mobile number is required' }
  const mode = paymentsMode()
  if (mode === 'off') {
    return { ok: false, error: 'Online payments are not enabled yet. Please use the Subscription page or contact support.' }
  }
  const amount = Number(process.env.PREMIUM_PRICE_KES)
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, error: 'Premium pricing is not configured. Please contact support.' }
  }
  let result
  try {
    result = await startPremiumPayment({ userId: ctx.userId, phone, amount, accountRef: `LL-${ctx.userId.slice(0, 8)}` })
  } catch (e) {
    return { ok: false, error: e.message || 'Payment could not be started' }
  }
  if (!result.started) {
    return { ok: false, error: 'Payments are not enabled yet. Please use the Subscription page or contact support.' }
  }

  // Ledger insert requires the service role (payments has no INSERT policy).
  const payRes = await fetchWithTimeout(`${ctx.supabaseUrl}/rest/v1/payments`, {
    method: 'POST',
    headers: {
      apikey: ctx.serviceKey,
      Authorization: `Bearer ${ctx.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: ctx.userId,
      provider: mode === 'sandbox' ? 'sandbox' : 'mpesa',
      provider_ref: result.reference || null,
      amount,
      currency: 'KES',
      plan: 'premium',
      status: result.simulated ? 'success' : 'pending',
      raw: { checkoutRequestId: result.checkoutRequestId || null, merchantRequestId: result.merchantRequestId || null },
    }),
  }, REQUEST_TIMEOUT_MS).then(async (res) => {
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text || 'null') } catch { /* keep null */ }
    return { ok: res.ok, data, error: data?.message }
  })
  if (!payRes.ok) return { ok: false, error: 'Payment started but could not be recorded. Contact support before retrying.' }

  if (result.simulated) {
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
    await rest(ctx, 'PATCH', `profiles?id=eq.${ctx.userId}`, {
      body: { subscription_plan: 'premium', subscription_status: 'active', subscription_expires_at: expiresAt },
      prefer: 'return=minimal',
    })
    await fetchWithTimeout(`${ctx.supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ actor_id: null, action: 'subscription_change', target_table: 'profiles', target_id: ctx.userId, metadata: { new_plan: 'premium', new_status: 'active', new_expires_at: expiresAt, reason: 'Sandbox payment via Oloo', source: 'payment' } }),
    }, REQUEST_TIMEOUT_MS).catch(() => {})
    return { ok: true, summary: `Sandbox payment completed — Premium is now active until ${expiresAt.slice(0, 10)}.`, data: { started: true, simulated: true, mode, status: 'success' } }
  }

  return {
    ok: true,
    summary: `M-Pesa prompt sent to ${phone}. Enter your PIN on your phone to complete the KES ${amount.toLocaleString('en-KE')} Premium payment. Your plan activates only after Safaricom confirms the payment.`,
    data: { started: true, simulated: false, mode, status: 'pending' },
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────
// confirm: true → chat returns a pendingAction; the client must POST
// /api/actions with the user's explicit confirmation before it executes.

export const OLOO_ACTIONS = {
  'diary.create': {
    confirm: true, run: diaryCreate,
    describe: (p) => `Save a diary entry for ${p.date || 'today'}: ${p.gambled ? 'gambled' : 'clean day'}${p.mood ? `, mood "${p.mood}"` : ''}${p.notes ? ` — "${String(p.notes).slice(0, 120)}${String(p.notes).length > 120 ? '…' : ''}"` : ''}`,
  },
  'diary.list': { confirm: false, run: diaryList },
  'events.list': { confirm: false, run: eventsList },
  'events.get': { confirm: false, run: eventsGet },
  'events.register': {
    confirm: true, run: eventsRegister,
    describe: (p) => `RSVP you as "${p.attendance === 'maybe' ? 'maybe' : 'going'}" for event ${p.event_id}.`,
  },
  'events.registrations': { confirm: false, run: eventsRegistrations },
  'cbt.get_progress': { confirm: false, run: cbtProgress },
  'navigation.open': { confirm: false, run: navigationOpen },
  'protection.get_status': { confirm: false, run: protectionStatus },
  'protection.get_cover': { confirm: false, run: protectionCover },
  'protection.get_claims': { confirm: false, run: protectionClaims },
  'subscriptions.get_status': { confirm: false, run: subscriptionsStatus },
  'subscriptions.get_plans': { confirm: false, run: subscriptionsPlans },
  'subscriptions.start_checkout': {
    confirm: true, run: subscriptionsCheckout,
    describe: (p) => `Start a Premium M-Pesa checkout (KES ${Number(process.env.PREMIUM_PRICE_KES || 0).toLocaleString('en-KE') || '—'}) to phone ${p.phone}.`,
  },
  'profile.get_preferences': { confirm: false, run: profilePreferences },
}

export function getAction(id) {
  return typeof id === 'string' ? OLOO_ACTIONS[id] || null : null
}
