// IndexedDB-backed offline queue for LossLens writes.
// Queue items are synced when the browser comes back online.
// Plain JS only — no JSX, no Vite-only APIs.

const DB_NAME = 'losslens-offline'
const DB_VERSION = 1
const STORE = 'queue'
const CHANGE_EVENT = 'losslens:offline-queue-change'

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    const result = fn(store)
    transaction.oncomplete = () => resolve(result?.result ?? result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function enqueueOfflineItem(kind, payload) {
  const db = await openDb()
  if (!db) return null
  const item = {
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  const id = await tx(db, 'readwrite', (store) => store.add(item))
  notifyChange()
  return id
}

export async function listOfflineItems() {
  const db = await openDb()
  if (!db) return []
  return tx(db, 'readonly', (store) => store.getAll())
}

export async function removeOfflineItem(id) {
  const db = await openDb()
  if (!db) return
  await tx(db, 'readwrite', (store) => store.delete(id))
  notifyChange()
}

export async function markOfflineItemAttempt(id) {
  const db = await openDb()
  if (!db) return
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = getReq.result
      if (item) {
        item.attempts = (item.attempts || 0) + 1
        item.lastAttemptAt = new Date().toISOString()
        store.put(item)
      }
    }
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function offlineQueueCount() {
  const items = await listOfflineItems()
  return items.length
}

function notifyChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function onOfflineQueueChange(listener) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('online', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('online', listener)
  }
}
