//  LossLens Protection state machine — single source of truth.
//  Mirrored by CHECK constraints in the combined SQL migration.
//  LossLens is NOT the insurer: the insurer sells the policy, collects
//  premiums and decides claims. Diary, chats, recordings and risk data are
//  never visible to insurers or therapists — only whitelisted status fields,
//  and only with the member's separate, revocable consent.

export const MEMBERSHIP_STATES = ['pending_verification', 'active', 'suspended', 'ended', 'rejected']

//  Allowed membership transitions. Anything not listed is rejected.
export const MEMBERSHIP_TRANSITIONS = {
  pending_verification: ['active', 'rejected', 'ended'],
  active: ['suspended', 'ended'],
  suspended: ['active', 'ended'],
  ended: [],
  rejected: [],
}

export const CONSENT_SCOPES = ['status_updates', 'session_summaries', 'billing_contact']

export function canTransitionMembership(from, to) {
  return (MEMBERSHIP_TRANSITIONS[from] || []).includes(to)
}

//  protection_mode system_settings key: concept | pilot | live.
//  concept = behaves exactly as today; pilot/live copy lives in
//  src/pages/public/protectionContent.js marked "pending legal review".
export const PROTECTION_MODES = ['concept', 'pilot', 'live']
