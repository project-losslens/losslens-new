import { useEffect, useState, useSyncExternalStore } from 'react'
import { loaderMinVisibleRemaining, retryVisible, shouldShowLoader, stillLoadingVisible } from '../lib/loaderTiming'
import { useI18n } from '../i18n'

const VISUALLY_HIDDEN = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

const subscribers = new Set()
let requestCount = 0
let isVisible = false
let shownAt = null
let showTimer = null
let hideTimer = null

function notifyLoaderSubscribers() {
  subscribers.forEach((subscriber) => subscriber())
}

function subscribeToLoader(subscriber) {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

function getLoaderVisibility() {
  return isVisible
}

function requestGlobalLoader() {
  requestCount += 1
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
  if (requestCount === 1 && !isVisible) {
    showTimer = window.setTimeout(() => {
      if (!shouldShowLoader({ elapsedMs: 150 })) return
      isVisible = true
      shownAt = Date.now()
      notifyLoaderSubscribers()
    }, 150)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    requestCount = Math.max(0, requestCount - 1)
    if (requestCount > 0) return

    if (showTimer) {
      window.clearTimeout(showTimer)
      showTimer = null
    }
    if (!isVisible) return

    const remaining = loaderMinVisibleRemaining({ shownAtMs: shownAt, nowMs: Date.now() })
    hideTimer = window.setTimeout(() => {
      if (requestCount > 0) return
      isVisible = false
      shownAt = null
      hideTimer = null
      notifyLoaderSubscribers()
    }, remaining)
  }
}

export function BrandLoader({ variant = 'fullscreen', label, showWordmark = variant === 'fullscreen', style }) {
  const { t } = useI18n()
  const loaderLabel = label || t('common.loading')
  useEffect(() => {
    if (variant !== 'fullscreen') return undefined
    return requestGlobalLoader()
  }, [variant])

  if (variant === 'fullscreen') return null
  return <BrandLoaderView variant={variant} label={loaderLabel} showWordmark={showWordmark} style={style} />
}

export function GlobalLoaderHost() {
  const visible = useSyncExternalStore(subscribeToLoader, getLoaderVisibility, () => false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const { t } = useI18n()

  useEffect(() => {
    if (!visible) {
      setElapsedMs(0)
      return undefined
    }
    const updateElapsed = () => setElapsedMs(Date.now() - shownAt)
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [visible])

  if (!visible) return null
  return <BrandLoaderView variant="fullscreen" label={t('common.loading')} showWordmark elapsedMs={elapsedMs} />
}

function BrandLoaderView({ variant, label, showWordmark, elapsedMs = 0, style }) {
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
  const markSize = isInline ? 20 : isFullscreen ? 72 : 44

  return (
    <div
      className={`brand-loader brand-loader--${variant}`}
      style={{ ...containerStyle, ...style }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <LogoMark size={markSize} className="brand-loader__mark" ariaHidden />
      {showWordmark && (
        <span className="brand-loader__wordmark" aria-hidden="true">
          Loss<span className="brand-loader__wordmark-accent">Lens</span>
        </span>
      )}
      {!isInline && <span className="brand-loader__label">{label}</span>}
      {isFullscreen && stillLoadingVisible(elapsedMs) && (
        <span className="brand-loader__still">Still loading...</span>
      )}
      {isFullscreen && retryVisible(elapsedMs) && (
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      )}
    </div>
  )
}

export function LogoMark({ size = 72, className = '', petalClass = 'brand-petal', ariaHidden = false }) {
  const petals = []
  for (let i = 0; i < 8; i += 1) {
    petals.push(
      <ellipse
        key={i}
        className={petalClass}
        cx="50" cy="26" rx="9" ry="20"
        fill={i % 2 === 0 ? 'var(--brand-teal)' : 'var(--brand-blue)'}
        opacity="0.9"
        transform={`rotate(${i * 45} 50 50)`}
        style={{ animationDelay: `${i * 0.1}s` }}
      />,
    )
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : 'LossLens logo'}
      aria-hidden={ariaHidden}
      fill="none"
    >
      <g className="brand-mark-spin">
        {petals}
        <circle cx="50" cy="50" r="12" stroke="var(--brand-blue)" strokeWidth="3" fill="none" />
        <circle cx="50" cy="50" r="4" fill="var(--brand-teal)" />
      </g>
    </svg>
  )
}
