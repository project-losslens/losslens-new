import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GATE_ENABLED,
  GATE_PASSWORD,
  GATE_SECRET,
  buildGateCookieValue,
  isGateEnabled,
  isSafeSameOriginRelativePath,
  matchesGatePassword,
  verifyGateCookieValue,
} from './gate.js'

test('gate constants are configured in code, not env vars', () => {
  assert.equal(GATE_ENABLED, true)
  assert.equal(isGateEnabled(), true)
  assert.equal(typeof GATE_PASSWORD, 'string')
  assert.ok(GATE_PASSWORD.length > 0)
  assert.ok(GATE_SECRET.length >= 32)
})

test('valid gate cookie verifies', () => {
  const expiry = Date.now() + 60_000
  const cookieValue = buildGateCookieValue(expiry)

  assert.equal(verifyGateCookieValue(cookieValue).ok, true)
})

test('tampered gate cookie fails validation', () => {
  const expiry = Date.now() + 60_000
  const cookieValue = `${buildGateCookieValue(expiry)}x`

  assert.equal(verifyGateCookieValue(cookieValue).ok, false)
})

test('expired gate cookie fails validation', () => {
  const expiredExpiry = Date.now() - 1_000
  const cookieValue = buildGateCookieValue(expiredExpiry)

  const result = verifyGateCookieValue(cookieValue)
  assert.equal(result.ok, false)
  assert.equal(result.expired, true)
})

test('cookie signed with a different secret fails validation', () => {
  const expiry = Date.now() + 60_000
  const value = buildGateCookieValue(expiry, 'a-different-secret')

  assert.equal(verifyGateCookieValue(value).ok, false)
})

test('same-origin redirect path allowed and open redirect rejected', () => {
  assert.equal(isSafeSameOriginRelativePath('/dashboard?plan=pro'), true)
  assert.equal(isSafeSameOriginRelativePath('//evil.example'), false)
  assert.equal(isSafeSameOriginRelativePath('https://evil.example'), false)
  assert.equal(isSafeSameOriginRelativePath('/\\evil.example'), false)
})

test('password matching is case-insensitive and trimmed', () => {
  assert.equal(matchesGatePassword(`  ${GATE_PASSWORD.toUpperCase()}  `), true)
  assert.equal(matchesGatePassword('wrong-password'), false)
})
