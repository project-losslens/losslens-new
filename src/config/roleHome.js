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
