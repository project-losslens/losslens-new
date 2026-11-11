//  Plan catalogue — mirrors the seeded `plans` table in the combined SQL.
//  Keep codes in sync with subscription_plan_allowed() in Postgres.
export const PLANS = {
  FREE: 'free',
  PREMIUM: 'premium',
  COMPANY: 'company',
  PROTECTION_MEMBER: 'protection_member',
}

export const PLAN_STATUSES = ['active', 'trialing', 'pending', 'inactive', 'cancelled', 'expired']

export const PLAN_META = {
  [PLANS.FREE]: { name: 'Free', priceKes: 0, period: 'month' },
  [PLANS.PREMIUM]: { name: 'Premium', priceKes: null, period: 'month' }, // price pending commercial decision
  [PLANS.COMPANY]: { name: 'Company', priceKes: null, period: 'month' },
  [PLANS.PROTECTION_MEMBER]: { name: 'Protection Member', priceKes: null, period: 'month' },
}
