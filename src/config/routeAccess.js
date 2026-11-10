import { roleHome } from './roleHome.js'

// Pure route-guard decision logic, shared by RequireAuth/PublicOnly so it can
// be unit-tested without rendering. Returns one of:
//   'suspended' | 'loading' | 'error' | 'no-session' | 'ready-other-role'
//   | 'redirect' | 'allow'
export function requireAuthDecision({ authStatus, role, currentRole, isAdmin = false, isSuperAdmin = false, status } = {}) {
  if (authStatus === 'ready' && status === 'suspended') return 'suspended'
  if (authStatus === 'loading') return 'loading'
  if (authStatus === 'no-session') return 'no-session'
  if (authStatus === 'error') return 'error'
  if (authStatus !== 'ready') return 'loading'
  if (!role && (currentRole === 'therapist' || currentRole === 'insurer')) return 'ready-other-role'
  if (role === 'admin' && !isAdmin) return 'redirect'
  if (role === 'super_admin' && !isSuperAdmin) return 'redirect'
  if (role === 'therapist' && currentRole !== 'therapist' && !isSuperAdmin) return 'redirect'
  if (role === 'insurer' && currentRole !== 'insurer' && !isSuperAdmin) return 'redirect'
  return 'allow'
}

export function publicOnlyDecision({ authStatus, user, role } = {}) {
  if (authStatus === 'loading') return 'loading'
  if (authStatus === 'error') return 'error'
  if (user) return 'redirect'
  return 'allow'
}

export function guardRedirectTarget({ decision, currentRole, locationPath }) {
  if (decision === 'ready-other-role') return roleHome(currentRole)
  if (decision === 'no-session') return '/login'
  return '/dashboard'
}
