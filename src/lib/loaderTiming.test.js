import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowLoader, loaderMinVisibleRemaining, stillLoadingVisible, retryVisible } from './loaderTiming.js'

test('loader stays hidden before 150ms', () => {
  assert.equal(shouldShowLoader({ elapsedMs: 0 }), false)
  assert.equal(shouldShowLoader({ elapsedMs: 149 }), false)
})

test('loader shows at 150ms', () => {
  assert.equal(shouldShowLoader({ elapsedMs: 150 }), true)
  assert.equal(shouldShowLoader({ elapsedMs: 5000 }), true)
})

test('once shown it stays shown', () => {
  assert.equal(shouldShowLoader({ elapsedMs: 10, shownAtMs: 200 }), true)
})

test('min visible window is 300ms', () => {
  assert.equal(loaderMinVisibleRemaining({ shownAtMs: 1000, nowMs: 1100 }), 200)
  assert.equal(loaderMinVisibleRemaining({ shownAtMs: 1000, nowMs: 1300 }), 0)
  assert.equal(loaderMinVisibleRemaining({ shownAtMs: null, nowMs: 0 }), 0)
})

test('still-loading and retry thresholds', () => {
  assert.equal(stillLoadingVisible(3999), false)
  assert.equal(stillLoadingVisible(4000), true)
  assert.equal(retryVisible(14999), false)
  assert.equal(retryVisible(15000), true)
})
