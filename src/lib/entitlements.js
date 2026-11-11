import { PLANS } from '../config/plans'

//  Entitlements — single source of truth for what each plan unlocks.
//  "Expired" always resolves to free. Core recovery and crisis help stay
//  free for everyone and are never gated.

export function effectivePlan(profile) {
  if (!profile) return PLANS.FREE
  const status = profile.subscription_status
  const expiresAt = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() : false
  const plan = profile.subscription_plan || profile.plan_type || PLANS.FREE
  if (!['active', 'trialing'].includes(status) || expired) {
    // company/protection memberships are managed outside self-serve billing
    if (profile.plan_type === 'company' && status === 'active') return PLANS.COMPANY
    if (plan === PLANS.PROTECTION_MEMBER && status === 'active' && !expired) return PLANS.PROTECTION_MEMBER
    return PLANS.FREE
  }
  return plan
}

const ENTITLEMENTS = {
  [PLANS.FREE]: {
    analyticsDetail: false,
    aiPriority: false,
    storageQuotaMb: 25,
  },
  [PLANS.PREMIUM]: {
    analyticsDetail: true,
    aiPriority: true,
    storageQuotaMb: 500,
  },
  [PLANS.COMPANY]: {
    analyticsDetail: true,
    aiPriority: true,
    storageQuotaMb: 500,
  },
  [PLANS.PROTECTION_MEMBER]: {
    analyticsDetail: true,
    aiPriority: true,
    storageQuotaMb: 500,
  },
}

export function getEntitlements(profile) {
  return ENTITLEMENTS[effectivePlan(profile)] || ENTITLEMENTS[PLANS.FREE]
}

export function hasEntitlement(profile, key) {
  return Boolean(getEntitlements(profile)[key])
}
