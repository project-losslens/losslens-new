import test from 'node:test'
import assert from 'node:assert/strict'
import { roleHome, safeInternalPath } from './roleHome.js'

test('roleHome routes each role to its landing page', () => {
  assert.equal(roleHome('super_admin'), '/admin')
  assert.equal(roleHome('admin'), '/admin')
  assert.equal(roleHome('insurer'), '/insurer')
  assert.equal(roleHome('therapist'), '/therapist')
  assert.equal(roleHome('user'), '/dashboard')
  assert.equal(roleHome(null), '/dashboard')
})

test('safeInternalPath preserves safe paths and rejects external destinations', () => {
  assert.equal(safeInternalPath('/diary?day=today#entry', 'https://losslens.test'), '/diary?day=today#entry')
  assert.equal(safeInternalPath('//attacker.test/path', 'https://losslens.test'), null)
  assert.equal(safeInternalPath('https://attacker.test/path', 'https://losslens.test'), null)
  assert.equal(safeInternalPath('/\\attacker.test', 'https://losslens.test'), null)
})
