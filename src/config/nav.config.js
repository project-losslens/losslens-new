export const userNav = [
  { to: '/dashboard', label: 'Home', icon: 'home', end: true },
  { to: '/diary', label: 'Diary', icon: 'diary' },
  { to: '/cbt', label: 'CBT Modules', icon: 'brain' },
  { to: '/urge-toolkit', label: 'Urge Toolkit', icon: 'toolkit' },
  { to: '/circle', label: 'The Circle', icon: 'chat' },
  { to: '/whispers', label: 'Whispers', icon: 'users' },
  { to: '/events', label: 'Events', icon: 'calendar' },
  { to: '/resources', label: 'Resources', icon: 'resources' },
  { to: '/family-portal', label: 'Family Portal', icon: 'users' },
  { to: '/monthly-mirror', label: 'Monthly Mirror', icon: 'profile' },
  { to: '/precious-pact', label: 'LossLens Pact', icon: 'document' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
  { to: '/subscription', label: 'Subscription', icon: 'diamond' },
]

export const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: 'home', end: true },
  { to: '/admin/events', label: 'Events', icon: 'calendar' },
  { to: '/admin/groups', label: 'Groups', icon: 'users' },
  { to: '/admin/resources', label: 'Resources', icon: 'resources' },
  { to: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/admin/broadcast', label: 'Broadcast', icon: 'broadcast' },
  { to: '/admin/crisis', label: 'Crisis Alerts', icon: 'alert' },
  { to: '/admin/users', label: 'User Management', icon: 'users', section: 'elevated' },
  { to: '/admin/insurance', label: 'Insurance Partners', icon: 'medical', section: 'elevated' },
  { to: '/admin/b2b', label: 'B2B Clients', icon: 'building', section: 'elevated' },
  { to: '/admin/grants', label: 'Grant Applications', icon: 'document', section: 'elevated' },
  { to: '/admin/chats', label: 'Chat Viewer', icon: 'chat', section: 'elevated' },
  { to: '/admin/logs', label: 'Audit Logs', icon: 'document', section: 'elevated' },
  { to: '/admin/settings', label: 'System Settings', icon: 'settings', section: 'elevated' },
]

export function getPageTitle(pathname) {
  const pageTitles = {
    '/admin': 'Admin Dashboard',
    '/dashboard': 'Dashboard',
    '/diary': "Today's Diary",
    '/precious-pact': 'The LossLens Pact',
    '/profile': 'My Profile',
  }
  if (pageTitles[pathname]) return pageTitles[pathname]

  const navItem = [...userNav, ...adminNav]
    .filter((item) => item.to === pathname || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (navItem) return navItem.label
  return 'LossLens'
}
