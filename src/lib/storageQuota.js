import { supabase } from './supabase'

//  Per-user storage quota for recording buckets. Sums object sizes under
//  `<userId>/` in each bucket (one level of month subfolders) and compares
//  against the plan's storageQuotaMb entitlement. Client-side enforcement;
//  bucket-level file size limits remain the server-side backstop.

const QUOTA_BUCKETS = ['mirror-recordings', 'precious-pacts']

async function folderBytes(bucket, folderPath, depth = 0) {
  const { data, error } = await supabase.storage.from(bucket).list(folderPath, { limit: 1000 })
  if (error || !data) return 0
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

// Returns { allowed, usedMb, quotaMb }. Fails open on listing errors so a
// storage API hiccup never blocks recovery recordings.
export async function checkStorageQuota(userId, quotaMb, extraMb = 0) {
  const quota = Number.isFinite(quotaMb) ? quotaMb : 0
  try {
    const usedMb = await getStorageUsageMb(userId)
    return { allowed: usedMb + extraMb <= quota, usedMb, quotaMb: quota }
  } catch {
    return { allowed: true, usedMb: 0, quotaMb: quota }
  }
}
