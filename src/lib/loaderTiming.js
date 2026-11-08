// Pure timing helpers for BrandLoader visibility.
// Show after `delayMs` of continuous loading; once shown, keep visible at
// least `minVisibleMs` even if loading finishes.
export function shouldShowLoader({ elapsedMs, shownAtMs = null }) {
  if (shownAtMs !== null) return true
  return elapsedMs >= 150
}

export function loaderMinVisibleRemaining({ shownAtMs, nowMs }) {
  if (shownAtMs === null) return 0
  return Math.max(0, shownAtMs + 300 - nowMs)
}

export function stillLoadingVisible(elapsedMs) {
  return elapsedMs >= 4000
}

export function retryVisible(elapsedMs) {
  return elapsedMs >= 15000
}
