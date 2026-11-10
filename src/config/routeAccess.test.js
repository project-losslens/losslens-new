import test from 'node:test'
import assert from 'node:assert/strict'
import { requireAuthDecision, publicOnlyDecision } from './routeAccess.js'

test('requireAuthDecision handles auth states', () => {
  assert.equal(requireAuthDecision({ authStatus: 'loading' }), 'loading')
  assert.equal(requireAuthDecision({ authStatus: 'no-session' }), 'no-session')
  assert.equal(requireAuthDecision({ authStatus: 'error' }), 'error')
  assert.equal(requireAuthDecision({ authStatus: 'ready', status: 'suspended' }), 'suspended')
})

test('requireAuthDecision redirects portal roles away from user routes', () => {
  assert.equal(
    requireAuthDecision({ authStatus: 'ready', role: undefined, currentRole: 'therapist' }),
    'ready-other-role',
  )
  assert.equal(
    requireAuthDecision({ authStatus: 'ready', role: undefined, currentRole: 'insurer' }),
    'ready-other-role',
  )
})

test('requireAuthDecision enforces role requirements', () => {
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'admin', currentRole: 'user', isAdmin: false }), 'redirect')
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'admin', currentRole: 'admin', isAdmin: true }), 'allow')
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'therapist', currentRole: 'user' }), 'redirect')
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'therapist', currentRole: 'therapist' }), 'allow')
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'insurer', currentRole: 'insurer' }), 'allow')
  // super_admin bypasses role-specific guards
  assert.equal(requireAuthDecision({ authStatus: 'ready', role: 'insurer', currentRole: 'admin', isSuperAdmin: true }), 'allow')
  assert.equal(requireAuthDecision({ authStatus: 'ready' }), 'allow')
})

test('publicOnlyDecision redirects signed-in users', () => {
  assert.equal(publicOnlyDecision({ authStatus: 'loading' }), 'loading')
  assert.equal(publicOnlyDecision({ authStatus: 'error' }), 'error')
  assert.equal(publicOnlyDecision({ authStatus: 'ready', user: null }), 'allow')
  assert.equal(publicOnlyDecision({ authStatus: 'ready', user: { id: 'x' }, role: 'user' }), 'redirect')
})
