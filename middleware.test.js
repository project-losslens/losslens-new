import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'

import middleware from './middleware.js'
import { buildGateCookieValue, GATE_COOKIE_NAME } from './lib/gate.js'

const TEST_PASSWORD = 'temporary-test-password'
const TEST_SECRET = 'test-secret-with-adequate-length'
const ENV_KEYS = ['SITE_GATE', 'SITE_GATE_PASSWORD', 'SITE_GATE_SECRET']

async function withGateEnv(overrides, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  for (const key of ENV_KEYS) {
    if (Object.hasOwn(overrides, key)) {
      if (overrides[key] === undefined) delete process.env[key]
      else process.env[key] = overrides[key]
    } else {
      delete process.env[key]
    }
  }
  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function request(path = '/', options = {}) {
  return new Request(`https://losslens.example${path}`, options)
}

function configuredEnv(overrides = {}) {
  return {
    SITE_GATE: 'on',
    SITE_GATE_PASSWORD: TEST_PASSWORD,
    SITE_GATE_SECRET: TEST_SECRET,
    ...overrides,
  }
}

test('no cookie receives the gate page', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/private'))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Cache-Control'), /no-store/)
    assert.match(await response.text(), /Access password/)
  })
})

test('wrong password receives the gate page with a visible error', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/__gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=wrong&next=%2Fprivate',
    }))
    assert.equal(response.status, 200)
    assert.match(await response.text(), /That password is not right/)
  })
})

test('right password redirects with a signed HttpOnly cookie', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/__gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(TEST_PASSWORD)}&next=%2Fprivate%3Ftab%3Ddiary`,
    }))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), 'https://losslens.example/private?tab=diary')
    assert.match(response.headers.get('Set-Cookie'), new RegExp(`^${GATE_COOKIE_NAME}=`))
    assert.match(response.headers.get('Set-Cookie'), /HttpOnly/)
    assert.match(response.headers.get('Set-Cookie'), /Secure/)
    assert.match(response.headers.get('Set-Cookie'), /SameSite=Lax/)
  })
})

test('valid cookie passes through to Vercel routing', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const cookie = buildGateCookieValue(Date.now() + 60_000, TEST_SECRET)
    const response = await middleware(request('/dashboard', {
      headers: { Cookie: `${GATE_COOKIE_NAME}=${cookie}` },
    }))
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow')
  })
})

test('tampered cookie receives the gate page', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const cookie = buildGateCookieValue(Date.now() + 60_000, TEST_SECRET)
    const response = await middleware(request('/dashboard', {
      headers: { Cookie: `${GATE_COOKIE_NAME}=${cookie}0` },
    }))
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Access password/)
  })
})

test('/api requests without a cookie receive 401 JSON', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/api/chat'))
    assert.equal(response.status, 401)
    assert.match(response.headers.get('Content-Type'), /application\/json/)
    assert.deepEqual(await response.json(), { error: 'Unauthorized' })
  })
})

test('/assets requests without a cookie receive the gate page', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/assets/app.js'))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type'), /text\/html/)
    assert.match(await response.text(), /Access password/)
  })
})

test('missing gate environment variables fail closed and name missing keys', async () => {
  await withGateEnv({ SITE_GATE: 'on', SITE_GATE_PASSWORD: undefined, SITE_GATE_SECRET: undefined }, async () => {
    const response = await middleware(request('/'))
    assert.equal(response.status, 503)
    const body = await response.text()
    assert.match(body, /SITE_GATE_PASSWORD/)
    assert.match(body, /SITE_GATE_SECRET/)
  })
})

test('SITE_GATE=off passes through without gate headers', async () => {
  await withGateEnv({ SITE_GATE: 'off' }, async () => {
    const response = await middleware(request('/'))
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(response.headers.get('X-Robots-Tag'), null)
  })
})

test('/__gate/lock expires the cookie and redirects home', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/__gate/lock'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), 'https://losslens.example/')
    assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/)
  })
})

test('open-redirect next value redirects only to the same origin', async () => {
  await withGateEnv(configuredEnv(), async () => {
    const response = await middleware(request('/__gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(TEST_PASSWORD)}&next=${encodeURIComponent('https://evil.example')}`,
    }))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), 'https://losslens.example/')
  })
})
