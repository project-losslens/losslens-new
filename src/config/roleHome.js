export function roleHome(role) {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return '/admin'
    case 'insurer':
      return '/insurer'
    case 'therapist':
      return '/therapist'
    default:
      return '/dashboard'
  }
}

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/family-join',
  '/protection',
  '/privacy',
  '/terms',
  '/about',
  '/partners',
  '/demo',
  '/auth/callback',
  '/insurer/login',
]

const USER_PATHS = [
  '/dashboard',
  '/onboarding',
  '/diary',
  '/cbt',
  '/urge-toolkit',
  '/circle',
  '/whispers',
  '/events',
  '/resources',
  '/profile',
  '/precious-pact',
  '/monthly-mirror',
  '/family-portal',
  '/subscription',
]

const ADMIN_PATHS = [
  '/admin',
  '/admin/events',
  '/admin/groups',
  '/admin/resources',
  '/admin/analytics',
  '/admin/broadcast',
  '/admin/crisis',
]

const SUPER_ADMIN_PATHS = [
  '/super-admin',
  '/super-admin/users',
  '/super-admin/insurance',
  '/super-admin/b2b',
  '/super-admin/grants',
  '/super-admin/chats',
  '/super-admin/logs',
  '/super-admin/settings',
  '/super-admin/therapists',
  '/super-admin/insurers',
  '/super-admin/float',
]

const LEGACY_SUPER_ADMIN_PATHS = [
  '/admin/users',
  '/admin/insurance',
  '/admin/b2b',
  '/admin/grants',
  '/admin/chats',
  '/admin/logs',
  '/admin/settings',
  '/admin/therapists',
  '/admin/insurers',
  '/admin/float',
]

const THERAPIST_PATHS = [
  '/therapist',
  '/therapist/onboarding',
  '/therapist/claims/new',
  '/therapist/payouts',
]

const INSURER_PATHS = [
  '/insurer',
  '/insurer/claims',
  '/insurer/invoices',
  '/insurer/analytics',
]

function isWithinRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function canAccessPath(role, path) {
  const safePath = safeInternalPath(path)
  if (!safePath) return false
  const pathname = safePath.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'

  if (PUBLIC_PATHS.includes(pathname)) return true
  if (USER_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return ['user', 'admin', 'super_admin'].includes(role)
  }
  if (LEGACY_SUPER_ADMIN_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return role === 'super_admin'
  }
  if (ADMIN_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return role === 'admin' || role === 'super_admin'
  }
  if (SUPER_ADMIN_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return role === 'super_admin'
  }
  if (THERAPIST_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return role === 'therapist'
  }
  if (INSURER_PATHS.some((route) => isWithinRoute(pathname, route))) {
    return role === 'insurer'
  }
  return false
}

export function safeInternalPath(path, origin = globalThis.location?.origin ?? 'https://losslens.invalid') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return null
  }

  if ([...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return null
  }

  try {
    const url = new URL(path, origin)
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}
