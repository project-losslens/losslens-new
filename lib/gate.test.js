import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildGateCookieValue,
  gateEnvHasSecrets,
  isGateEnabled,
  isSafeSameOriginRelativePath,
  matchesGatePassword,
  verifyGateCookieValue,
} from './gate.js'

test('valid gate cookie verifies', () => {
  const secret = 'test-secret'
  const expiry = Date.now() + 60_000
  const cookieValue = buildGateCookieValue(expiry, secret)

  assert.equal(verifyGateCookieValue(cookieValue, secret).ok, true)
})

test('tampered gate cookie fails validation', () => {
  const secret = 'test-secret'
  const expiry = Date.now() + 60_000
  const cookieValue = `${buildGateCookieValue(expiry, secret)}x`

  assert.equal(verifyGateCookieValue(cookieValue, secret).ok, false)
})

test('expired gate cookie fails validation', () => {
  const secret = 'test-secret'
  const expiredExpiry = Date.now() - 1_000
  const cookieValue = buildGateCookieValue(expiredExpiry, secret)

  const result = verifyGateCookieValue(cookieValue, secret)
  assert.equal(result.ok, false)
  assert.equal(result.expired, true)
})

test('wrong secret fails validation', () => {
  const expiry = Date.now() + 60_000
  const value = buildGateCookieValue(expiry, 'right-secret')

  assert.equal(verifyGateCookieValue(value, 'wrong-secret').ok, false)
})

test('same-origin redirect path allowed and open redirect rejected', () => {
  assert.equal(isSafeSameOriginRelativePath('/dashboard?plan=pro'), true)
  assert.equal(isSafeSameOriginRelativePath('//evil.example'), false)
  assert.equal(isSafeSameOriginRelativePath('https://evil.example'), false)
  assert.equal(isSafeSameOriginRelativePath('/\\evil.example'), false)
})

test('password matching is case-insensitive and trimmed', () => {
  assert.equal(matchesGatePassword('  SecretPass  ', 'secretpass'), true)
  assert.equal(matchesGatePassword('secretpass', 'different'), false)
})

test('missing gate env fails closed', () => {
  assert.equal(isGateEnabled({ SITE_GATE: 'on' }), true)
  assert.equal(isGateEnabled({ SITE_GATE: 'off' }), false)
  assert.equal(gateEnvHasSecrets({ SITE_GATE_PASSWORD: '', SITE_GATE_SECRET: '' }), false)
})
