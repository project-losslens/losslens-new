export function readAndMigrateStorageItem(key, legacyKey) {
  const currentValue = localStorage.getItem(key)
  if (currentValue !== null) return currentValue

  const legacyValue = localStorage.getItem(legacyKey)
  if (legacyValue !== null) {
    localStorage.setItem(key, legacyValue)
    localStorage.removeItem(legacyKey)
  }
  return legacyValue
}
