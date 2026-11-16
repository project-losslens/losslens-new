import { test } from 'node:test'
import assert from 'node:assert/strict'

import { extractAction } from '../api/_lib/oloo/protocol.js'
import { getAction, OLOO_ACTIONS } from '../api/_lib/oloo/actions.js'
import { resolveOlooRoute } from '../src/config/olooRoutes.js'

test('extractAction: plain reply passes through', () => {
  const r = extractAction('Hello there, how are you?')
  assert.equal(r.reply, 'Hello there, how are you?')
  assert.equal(r.action, null)
})

test('extractAction: parses trailing ACTION directive', () => {
  const r = extractAction('Sure, here are your events.\nACTION: {"id":"events.list","params":{}}')
  assert.equal(r.reply, 'Sure, here are your events.')
  assert.deepEqual(r.action, { id: 'events.list', params: {} })
})

test('extractAction: ignores malformed JSON and mid-text ACTION', () => {
  const r1 = extractAction('done\nACTION: {not json}')
  assert.equal(r1.action, null)
  const r2 = extractAction('ACTION: {"id":"diary.list"} more text after')
  assert.equal(r2.action, null)
})

test('extractAction: rejects non-string ids and non-object params', () => {
  const r = extractAction('x\nACTION: {"id":123,"params":[1]}')
  assert.equal(r.action, null)
})

test('registry: every action has run + confirm flag; ids are unique', () => {
  const ids = Object.keys(OLOO_ACTIONS)
  assert.equal(new Set(ids).size, ids.length)
  for (const [id, def] of Object.entries(OLOO_ACTIONS)) {
    assert.equal(typeof def.run, 'function', id)
    assert.equal(typeof def.confirm, 'boolean', id)
  }
})

test('registry: consequential actions require confirmation', () => {
  for (const id of ['diary.create', 'events.register', 'subscriptions.start_checkout']) {
    assert.equal(OLOO_ACTIONS[id].confirm, true, id)
  }
  for (const id of ['diary.list', 'events.list', 'protection.get_status', 'subscriptions.get_status']) {
    assert.equal(OLOO_ACTIONS[id].confirm, false, id)
  }
})

test('getAction: unknown ids return null (no arbitrary execution)', () => {
  assert.equal(getAction('admin.drop_tables'), null)
  assert.equal(getAction('../../../etc/passwd'), null)
  assert.equal(getAction(''), null)
  assert.equal(getAction(null), null)
})

test('routes: only registered keys resolve', () => {
  assert.equal(resolveOlooRoute('diary').path, '/diary')
  assert.equal(resolveOlooRoute('https://evil.example'), null)
  assert.equal(resolveOlooRoute('javascript:alert(1)'), null)
  assert.equal(resolveOlooRoute('/admin/users'), null)
})

test('navigation.open rejects unknown routes', async () => {
  const def = getAction('navigation.open')
  const bad = await def.run({}, { route: 'https://evil.example' })
  assert.equal(bad.ok, false)
  const good = await def.run({}, { route: 'diary' })
  assert.equal(good.ok, true)
  assert.equal(good.data.navigate, '/diary')
})

test('diary.create rejects missing/invalid gambled', async () => {
  const def = getAction('diary.create')
  const ctx = { userId: 'u', token: 't', supabaseUrl: 'http://x', supabaseKey: 'k' }
  const bad = await def.run(ctx, {})
  assert.equal(bad.ok, false)
})

test('subscriptions.get_plans returns catalogue without network', () => {
  const def = getAction('subscriptions.get_plans')
  const res = def.run({}, {})
  assert.equal(res.ok, true)
  assert.ok(Array.isArray(res.data.plans))
  assert.ok(res.data.plans.length >= 3)
})
