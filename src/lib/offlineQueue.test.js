import test from 'node:test'
import assert from 'node:assert/strict'
import {
  enqueueOfflineItem,
  listOfflineItems,
  offlineQueueCount,
  onOfflineQueueChange,
} from './offlineQueue.js'

// Node has no IndexedDB: the queue must degrade gracefully (no-ops) rather
// than throw, so callers never break in unsupported environments.
test('offline queue degrades gracefully without IndexedDB', async () => {
  assert.equal(await enqueueOfflineItem('diary_entry', { date: '2026-01-01' }), null)
  assert.deepEqual(await listOfflineItems(), [])
  assert.equal(await offlineQueueCount(), 0)
  const unsub = onOfflineQueueChange(() => {})
  assert.equal(typeof unsub, 'function')
  unsub()
})
