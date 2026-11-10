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

// Grouped navigation for the user role (mobile bottom bar + desktop sidebar).
// Paths and feature names are unchanged — grouping only.
export const userNavGroups = [
  {
    title: 'Main',
    items: [
      { to: '/dashboard', label: 'Home', icon: 'home', end: true },
      { to: '/diary', label: 'Diary', icon: 'diary' },
      { to: '/urge-toolkit', label: 'Help', icon: 'toolkit' },
    ],
  },
  {
    title: 'Community',
    items: [
      { to: '/circle', label: 'The Circle', icon: 'chat' },
      { to: '/whispers', label: 'Whispers', icon: 'users' },
      { to: '/events', label: 'Events', icon: 'calendar' },
    ],
  },
  {
    title: 'More',
    items: [
      { to: '/cbt', label: 'CBT Modules', icon: 'brain' },
      { to: '/resources', label: 'Resources', icon: 'resources' },
      { to: '/family-portal', label: 'Family Portal', icon: 'users' },
      { to: '/monthly-mirror', label: 'Monthly Mirror', icon: 'profile' },
      { to: '/precious-pact', label: 'LossLens Pact', icon: 'document' },
      { to: '/profile', label: 'Profile', icon: 'profile' },
      { to: '/subscription', label: 'Subscription', icon: 'diamond' },
    ],
  },
]

// Mobile bottom bar: Home, Diary, Help, Community, More
export const mobileTabs = [
  { to: '/dashboard', label: 'Home', icon: 'home', end: true },
  { to: '/diary', label: 'Diary', icon: 'diary' },
  { to: '/urge-toolkit', label: 'Help', icon: 'toolkit' },
  { to: '/circle', label: 'Community', icon: 'users', match: ['/circle', '/whispers', '/events'] },
  { to: null, label: 'More', icon: 'menu' },
]

export const communityPaths = ['/circle', '/whispers', '/events']

export const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: 'home', end: true },
  { to: '/admin/events', label: 'Events', icon: 'calendar' },
  { to: '/admin/groups', label: 'Groups', icon: 'users' },
  { to: '/admin/resources', label: 'Resources', icon: 'resources' },
  { to: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/admin/broadcast', label: 'Broadcast', icon: 'broadcast' },
  { to: '/admin/crisis', label: 'Crisis Alerts', icon: 'alert' },
  { to: '/admin/therapists', label: 'Therapist Management', icon: 'medical', superAdminOnly: true },
  { to: '/admin/float', label: 'Float Management', icon: 'analytics', superAdminOnly: true },
  { to: '/admin/users', label: 'User Management', icon: 'users', section: 'elevated' },
  { to: '/admin/insurance', label: 'Insurance Partners', icon: 'medical', section: 'elevated' },
  { to: '/admin/b2b', label: 'B2B Clients', icon: 'building', section: 'elevated' },
  { to: '/admin/grants', label: 'Grant Applications', icon: 'document', section: 'elevated' },
  { to: '/admin/chats', label: 'Chat Viewer', icon: 'chat', section: 'elevated' },
  { to: '/admin/logs', label: 'Audit Logs', icon: 'document', section: 'elevated' },
  { to: '/admin/settings', label: 'System Settings', icon: 'settings', section: 'elevated' },
  { to: '/admin/insurers', label: 'Insurer Management', icon: 'building', section: 'elevated' },
]

export const therapistNav = [
  { to: '/therapist', label: 'Therapist', icon: 'medical', end: true },
  { to: '/therapist/onboarding', label: 'Verification', icon: 'profile' },
  { to: '/therapist/payouts', label: 'Payouts', icon: 'document' },
]

export const insurerNav = [
  { to: '/insurer', label: 'Insurer', icon: 'building', end: true },
  { to: '/insurer/claims', label: 'Claims', icon: 'document' },
  { to: '/insurer/invoices', label: 'Invoices', icon: 'document' },
  { to: '/insurer/analytics', label: 'Analytics', icon: 'analytics' },
]

export function getPageTitle(pathname) {
  const pageTitles = {
    '/admin': 'Admin Dashboard',
    '/admin/float': 'Claims Float',
    '/dashboard': 'Dashboard',
    '/diary': "Today's Diary",
    '/precious-pact': 'The LossLens Pact',
    '/profile': 'My Profile',
    '/therapist': 'Therapist Portal',
    '/insurer': 'Insurer Portal',
  }
  if (pageTitles[pathname]) return pageTitles[pathname]

  const navItem = [...userNav, ...adminNav]
    .filter((item) => item.to === pathname || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (navItem) return navItem.label
  return 'LossLens'
}
