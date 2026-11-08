// Tests for the temporary site gate password check.
// The real gate password is never stored here — only its SHA-256 hash.
// A throwaway test password is hashed at runtime and passed as expectedHash.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const REQUIRED_HASH = 'f91ff1d36becc41df298e7b9944c033146e14688dea6933050a86030a0b33454'

let siteGate, server

before(async () => {
  server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  siteGate = await server.ssrLoadModule('/src/components/SiteGate.jsx')
})

after(async () => {
  await server?.close()
})

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

test('expected hash constant matches the required hash', () => {
  assert.equal(siteGate.SITE_GATE_EXPECTED_HASH, REQUIRED_HASH)
})

test('correct password matches regardless of case and surrounding spaces', async () => {
  const password = `gate-test-${Math.random().toString(36).slice(2)}`
  const hash = await sha256Hex(password)
  assert.equal(await siteGate.siteGatePasswordMatches(password, hash), true)
  assert.equal(await siteGate.siteGatePasswordMatches(`  ${password.toUpperCase()}  `, hash), true)
  assert.equal(await siteGate.siteGatePasswordMatches(`\t${password}\n`, hash), true)
})

test('wrong and empty passwords do not match', async () => {
  const password = `gate-test-${Math.random().toString(36).slice(2)}`
  const hash = await sha256Hex(password)
  assert.equal(await siteGate.siteGatePasswordMatches('definitely-wrong', hash), false)
  assert.equal(await siteGate.siteGatePasswordMatches('', hash), false)
  assert.equal(await siteGate.siteGatePasswordMatches('   ', hash), false)
  assert.equal(await siteGate.siteGatePasswordMatches(null, hash), false)
})

test('default expected hash rejects a wrong password', async () => {
  assert.equal(await siteGate.siteGatePasswordMatches('definitely-wrong'), false)
  assert.equal(await siteGate.siteGatePasswordMatches(''), false)
})
