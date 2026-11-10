import { Component } from 'react'
import AppIcon from './AppIcon'

// Route-level safety net. Wrap <Routes> (or a layout) so a render error in any
// page shows a calm fallback with a retry instead of a blank screen.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Route error:', error, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="state-wrap" role="alert">
          <AppIcon name="alert" size={40} style={{ color: '#7DBDEE', marginBottom: '12px' }} />
          <h2 style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', marginBottom: '16px', maxWidth: '320px' }}>
            This page hit an unexpected error. Your data is safe — try again.
          </p>
          <button type="button" className="btn-primary" onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function EmptyState({ icon = 'chat', title, children }) {
  return (
    <div className="state-wrap">
      <AppIcon name={icon} size={40} style={{ color: '#7DBDEE', marginBottom: '12px' }} />
      <h2 style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>{title}</h2>
      {children}
    </div>
  )
}

export function ErrorState({ message = 'Could not load this right now.', onRetry }) {
  return (
    <div className="state-wrap" role="alert">
      <AppIcon name="alert" size={40} style={{ color: '#7DBDEE', marginBottom: '12px' }} />
      <h2 style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Something went wrong</h2>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', marginBottom: '16px', maxWidth: '320px' }}>{message}</p>
      {onRetry && (
        <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

// Pulsing placeholder block for loading states. Respects reduced motion via CSS.
export function Skeleton({ width = '100%', height = '16px', style }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-wrap" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', marginTop: '12px' }}>{label}</p>
    </div>
  )
}
