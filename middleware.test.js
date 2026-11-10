import assert from 'node:assert/strict'
import test from 'node:test'

import middleware from './middleware.js'
import {
  GATE_PASSWORD,
  GATE_SECRET,
  buildGateCookieValue,
  GATE_COOKIE_NAME,
} from './lib/gate.js'

function request(path = '/', options = {}) {
  return new Request(`https://losslens.example${path}`, options)
}

function gatePost(body) {
  return request('/__gate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

test('no cookie receives the gate page', async () => {
  const response = await middleware(request('/private'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/)
  assert.match(await response.text(), /Access password/)
})

test('wrong password receives the gate page with a visible error', async () => {
  const response = await middleware(gatePost('password=wrong&next=%2Fprivate'))
  assert.equal(response.status, 200)
  assert.match(await response.text(), /That password is not right/)
})

test('right password redirects with a signed HttpOnly cookie', async () => {
  const response = await middleware(gatePost(
    `password=${encodeURIComponent(GATE_PASSWORD)}&next=${encodeURIComponent('/private?tab=diary')}`,
  ))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), 'https://losslens.example/private?tab=diary')
  assert.match(response.headers.get('Set-Cookie'), new RegExp(`^${GATE_COOKIE_NAME}=`))
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/)
  assert.match(response.headers.get('Set-Cookie'), /Secure/)
  assert.match(response.headers.get('Set-Cookie'), /SameSite=Lax/)
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=604800/)
})

test('valid cookie passes through to Vercel routing', async () => {
  const cookie = buildGateCookieValue(Date.now() + 60_000)
  const response = await middleware(request('/dashboard', {
    headers: { Cookie: `${GATE_COOKIE_NAME}=${cookie}` },
  }))
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow')
})

test('tampered cookie receives the gate page', async () => {
  const cookie = buildGateCookieValue(Date.now() + 60_000)
  const response = await middleware(request('/dashboard', {
    headers: { Cookie: `${GATE_COOKIE_NAME}=${cookie}0` },
  }))
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Access password/)
})

test('expired cookie receives the gate page', async () => {
  const cookie = buildGateCookieValue(Date.now() - 1_000)
  const response = await middleware(request('/dashboard', {
    headers: { Cookie: `${GATE_COOKIE_NAME}=${cookie}` },
  }))
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Access password/)
})

test('/api requests without a cookie receive 401 JSON', async () => {
  const response = await middleware(request('/api/chat'))
  assert.equal(response.status, 401)
  assert.match(response.headers.get('Content-Type'), /application\/json/)
  assert.deepEqual(await response.json(), { error: 'Unauthorized' })
})

test('/assets requests without a cookie receive the gate page', async () => {
  const response = await middleware(request('/assets/app.js'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /text\/html/)
  assert.match(await response.text(), /Access password/)
})

test('GATE_ENABLED = false passes everything through', async (t) => {
  const realGate = await import('./lib/gate.js')
  t.mock.module('./lib/gate.js', {
    exports: {
      ...realGate,
      GATE_ENABLED: false,
      GATE_SECRET,
      isGateEnabled: () => false,
    },
  })
  const { default: disabledMiddleware } = await import('./middleware.js?gate=disabled')
  const response = await disabledMiddleware(request('/'))
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get('X-Robots-Tag'), null)
})

test('/__gate/lock expires the cookie and redirects home', async () => {
  const response = await middleware(request('/__gate/lock'))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), 'https://losslens.example/')
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/)
})

test('open-redirect next value redirects only to the same origin', async () => {
  const response = await middleware(gatePost(
    `password=${encodeURIComponent(GATE_PASSWORD)}&next=${encodeURIComponent('https://evil.example')}`,
  ))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), 'https://losslens.example/')
})
