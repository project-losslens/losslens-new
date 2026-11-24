import { supabase } from './supabase'

//  Per-user storage quota for recording buckets. Sums object sizes under
//  `<userId>/` in each bucket (one level of month subfolders) and compares
//  against the plan's storageQuotaMb entitlement. Client-side enforcement;
//  bucket-level file size limits remain the server-side backstop.

const QUOTA_BUCKETS = ['mirror-recordings', 'precious-pacts']

async function folderBytes(bucket, folderPath, depth = 0) {
  const data = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await supabase.storage.from(bucket).list(folderPath, { limit: 1000, offset })
    if (error) throw error
    data.push(...(page || []))
    if (!page || page.length < 1000) break
  }
  let total = 0
  for (const item of data) {
    if (item.id) {
      total += item.metadata?.size || 0
    } else if (depth < 2 && item.name) {
      total += await folderBytes(bucket, `${folderPath}/${item.name}`, depth + 1)
    }
  }
  return total
}

export async function getStorageUsageMb(userId) {
  if (!userId) return 0
  let bytes = 0
  for (const bucket of QUOTA_BUCKETS) {
    bytes += await folderBytes(bucket, userId)
  }
  return bytes / (1024 * 1024)
}

// Returns { allowed, usedMb, quotaMb, error? }. Preserve the local recording
// when usage cannot be verified; the database enforces the actual plan quota.
export async function checkStorageQuota(userId, quotaMb, extraMb = 0) {
  const quota = Number.isFinite(quotaMb) ? quotaMb : 0
  try {
    const usedMb = await getStorageUsageMb(userId)
    return { allowed: usedMb + extraMb <= quota, usedMb, quotaMb: quota }
  } catch {
    return { allowed: false, usedMb: null, quotaMb: quota, error: 'Storage usage could not be verified. Please retry.' }
  }
}
