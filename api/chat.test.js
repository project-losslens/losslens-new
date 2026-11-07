/* global process */

import assert from 'node:assert/strict'
import test from 'node:test'

test('a crisis chat records an alert and pre-authorizes a voucher before replying', async () => {
  const previousEnvironment = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  process.env.VITE_SUPABASE_URL = 'https://supabase.test'
  process.env.SUPABASE_ANON_KEY = 'anon-test-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'

  const { default: handler } = await import('./chat.js')
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    requests.push({ url, options })
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-123' }), { status: 200 })
    }
    if (url.includes('/chat_history?')) {
      return new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } })
    }
    if (url.endsWith('/rest/v1/rpc/record_crisis_event')) {
      return new Response(JSON.stringify('alert-123'), { status: 200 })
    }
    if (url.endsWith('/rest/v1/chat_history')) {
      return new Response(null, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }

  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(body) { this.body = body },
  }

  try {
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer eyJ-test-token' },
      body: { messages: [{ role: 'user', content: 'I want to kill myself' }] },
    }, response)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  assert.equal(response.statusCode, 200)
  assert.match(JSON.parse(response.body).reply, /NACADA/)
  const crisisRequest = requests.find(({ url }) => url.endsWith('/rest/v1/rpc/record_crisis_event'))
  assert.ok(crisisRequest)
  assert.deepEqual(JSON.parse(crisisRequest.options.body), {
    p_user_id: 'user-123',
    p_keywords: ['kill myself'],
    p_context: 'I want to kill myself',
    p_source: 'chat',
    p_max_sessions: 1,
  })
  const crisisIndex = requests.indexOf(crisisRequest)
  const assistantHistoryIndex = requests.findIndex(({ url, options }) =>
    url.endsWith('/rest/v1/chat_history') && JSON.parse(options.body || '{}').role === 'assistant')
  assert.ok(crisisIndex >= 0 && assistantHistoryIndex > crisisIndex)
})
