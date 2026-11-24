import { supabase } from './supabase'

// Do not discard a local recording until its object AND index row exist.
export async function saveRecording(bucket, table, path, blob, metadata) {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.from(table).insert(metadata).select('id').single()
  if (error || !data?.id) {
    const { error: cleanupError } = await supabase.storage.from(bucket).remove([path])
    if (cleanupError) console.error('Recording cleanup failed:', cleanupError.code || 'storage_error')
    throw error || new Error('Recording could not be indexed. Please retry.')
  }
  return data
}
