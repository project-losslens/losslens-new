// Controlled route registry for Oloo navigation actions.
// Plain JS (Node-importable) — api/_lib/oloo/actions.js validates against this.
// Only routes that exist in src/App.jsx and are safe for the user's role belong here.

export const OLOO_ROUTES = {
  dashboard: { path: '/dashboard', label: 'Dashboard' },
  diary: { path: '/diary', label: 'Recovery Diary' },
  cbt: { path: '/cbt', label: 'CBT Modules' },
  urge_toolkit: { path: '/urge-toolkit', label: 'Urge Toolkit' },
  circle: { path: '/circle', label: 'The Circle' },
  whispers: { path: '/whispers', label: 'Whispers' },
  events: { path: '/events', label: 'Events' },
  resources: { path: '/resources', label: 'Resources' },
  profile: { path: '/profile', label: 'Profile & Settings' },
  precious_pact: { path: '/precious-pact', label: 'Precious Pact' },
  monthly_mirror: { path: '/monthly-mirror', label: 'Monthly Mirror' },
  family_portal: { path: '/family-portal', label: 'Family Portal' },
  subscription: { path: '/subscription', label: 'Subscription & Billing' },
  protection: { path: '/protection-member', label: 'LossLens Protection' },
  support: { path: '/support', label: 'Support' },
  pricing: { path: '/pricing', label: 'Pricing', public: true },
  protection_info: { path: '/protection', label: 'About LossLens Protection', public: true },
}

export function resolveOlooRoute(key) {
  return OLOO_ROUTES[key] || null
}
