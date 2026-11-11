import { Link } from 'react-router-dom'
import { useEntitlements } from '../hooks/useEntitlements'
import AppIcon from './AppIcon'

//  Gates a feature behind a plan entitlement. Shows an upgrade prompt
//  linking to /subscription when the user lacks it. Core recovery and
//  crisis features must NOT be wrapped in this.
export default function RequiresPlan({ entitlement, children, featureName }) {
  const { entitlements, plan, loading } = useEntitlements()
  if (loading) return null
  if (entitlements?.[entitlement]) return children
  return (
    <div className="dash-section" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
      <AppIcon name="diamond" size={40} style={{ color: '#F2C879', marginBottom: '12px' }} />
      <h3 style={{ color: '#FFFFFF', fontSize: '16px', margin: '0 0 8px' }}>{featureName || 'Premium feature'}</h3>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.6 }}>
        This is part of the Premium plan (you're on {plan}).
      </p>
      <Link to="/subscription" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>See plans</Link>
    </div>
  )
}
