import { useEffect, useRef, useState } from 'react'
import { shouldShowLoader, loaderMinVisibleRemaining, stillLoadingVisible, retryVisible } from '../lib/loaderTiming'

const VISUALLY_HIDDEN = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

export function BrandLoader({
  variant = 'fullscreen',
  label = 'Loading',
  showWordmark = variant === 'fullscreen',
}) {
  const [visible, setVisible] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const shownAtRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const now = Date.now()
      const elapsedMs = now - startedAt
      setElapsed(elapsedMs)
      if (shownAtRef.current === null && shouldShowLoader({ elapsedMs })) {
        shownAtRef.current = now
        setVisible(true)
      }
    }, 100)
    return () => clearInterval(timerRef.current)
  }, [])

  // Keep visible at least 300ms once shown (BrandLoader unmounts with the
  // loading state, so this is enforced by callers keeping it mounted briefly;
  // the helper is exported for that logic).
  void loaderMinVisibleRemaining

  if (!visible) return null

  const isFullscreen = variant === 'fullscreen'
  const isInline = variant === 'inline'

  const containerStyle = isFullscreen
    ? {
        position: 'fixed', inset: 0, zIndex: 'var(--z-toast, 9999)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', minHeight: '100dvh',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }
    : isInline
      ? { display: 'inline-flex', alignItems: 'center', gap: '10px' }
      : { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', padding: '2rem' }

  const markSize = isFullscreen ? 72 : isInline ? 20 : 44

  return (
    <div
      className={`brand-loader brand-loader--${variant}`}
      style={containerStyle}
      role="status"
      aria-live="polite"
    >
      <span style={VISUALLY_HIDDEN}>{label}</span>
      <LogoMark size={markSize} className="brand-loader__mark" aria-hidden="true" />
      {showWordmark && (
        <span className="brand-loader__wordmark" aria-hidden="true">
          Loss<span className="brand-loader__wordmark-accent">Lens</span>
        </span>
      )}
      {!isInline && (
        <span className="brand-loader__label">{label}</span>
      )}
      {isFullscreen && stillLoadingVisible(elapsed) && (
        <span className="brand-loader__still">Still loading...</span>
      )}
      {isFullscreen && retryVisible(elapsed) && (
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      )}
    </div>
  )
}

/* ---- LogoMark ---- */
// LossLens flower/aperture mark — 8 elliptical petals (alternating teal/blue)
// around a ring and center dot. Colors sampled from public/losslens-logo.png.
export function LogoMark({ size = 72, className = '', petalClass = 'brand-petal' }) {
  const petals = []
  for (let i = 0; i < 8; i++) {
    petals.push(
      <ellipse
        key={i}
        className={petalClass}
        cx="50" cy="26" rx="9" ry="20"
        fill={i % 2 === 0 ? 'var(--brand-teal)' : 'var(--brand-blue)'}
        opacity="0.9"
        transform={`rotate(${i * 45} 50 50)`}
        style={{ animationDelay: `${i * 0.35}s` }}
      />
    )
  }
  return (
    <svg
      className={className}
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label="LossLens logo" fill="none"
    >
      <g className="brand-mark-spin" style={{ transformOrigin: '50px 50px' }}>
        {petals}
        <circle cx="50" cy="50" r="12" stroke="var(--brand-blue)" strokeWidth="3" fill="none" />
        <circle cx="50" cy="50" r="4" fill="var(--brand-teal)" />
      </g>
    </svg>
  )
}
