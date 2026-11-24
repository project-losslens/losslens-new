export async function saveLocalRecording(storage, key, blob, metadata) {
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Recording could not be read'))
    reader.readAsDataURL(blob)
  })
  const existing = JSON.parse(storage.getItem(key) || '[]')
  if (!Array.isArray(existing)) throw new Error('Local recording storage needs recovery')
  storage.setItem(key, JSON.stringify([...existing, { ...metadata, url }]))
}