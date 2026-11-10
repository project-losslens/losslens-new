import test from 'node:test'
import assert from 'node:assert/strict'
import en from './en.js'
import sw from './sw.js'

test('en and sw dictionaries have identical keys', () => {
  const enKeys = Object.keys(en).sort()
  const swKeys = Object.keys(sw).sort()
  const missing = enKeys.filter((k) => !(k in sw))
  const extra = swKeys.filter((k) => !(k in en))
  assert.deepEqual(missing, [], `missing in sw: ${missing.join(', ')}`)
  assert.deepEqual(extra, [], `extra in sw: ${extra.join(', ')}`)
  assert.equal(enKeys.length, swKeys.length)
})

test('no dictionary value is empty', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.ok(typeof value === 'string' && value.trim().length > 0, `en:${key} is empty`)
  }
  for (const [key, value] of Object.entries(sw)) {
    assert.ok(typeof value === 'string' && value.trim().length > 0, `sw:${key} is empty`)
  }
})
