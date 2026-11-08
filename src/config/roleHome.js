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
