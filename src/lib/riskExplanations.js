// Maps raw risk-factor strings produced by relapsePrediction.js to i18n keys
// so the dashboard can show them in the user's language. Plain JS — Node-testable.

const RULES = [
  { match: /^Not enough data yet/, key: 'dashboard.riskFactor.noData' },
  { match: /has been high-risk historically$/, key: 'dashboard.riskFactor.dayHigh', dayParam: true },
  { match: /^Recent gambling activity detected$/, key: 'dashboard.riskFactor.recentGambling' },
  { match: /^(\d+) days since last diary entry$/, key: 'dashboard.riskFactor.missedEntries', countParam: true },
  { match: /^Elevated stress levels/, key: 'dashboard.riskFactor.stress' },
  { match: /^Payday period/, key: 'dashboard.riskFactor.payday' },
  { match: /^Weekend - historically/, key: 'dashboard.riskFactor.weekend' },
  { match: /^Evening hours/, key: 'dashboard.riskFactor.evening' },
]

// Returns { key, params } for t(), or null when no translation exists.
export function explainRiskFactor(factor) {
  if (typeof factor !== 'string') return null
  for (const rule of RULES) {
    if (!rule.match.test(factor)) continue
    if (rule.countParam) {
      const count = factor.match(/^(\d+)/)?.[1]
      return { key: rule.key, params: { count } }
    }
    if (rule.dayParam) {
      const day = factor.replace(/ has been high-risk historically$/, '')
      // relapsePrediction emits 'Weekend' or 'This day' as the prefix.
      const dayKey = day === 'Weekend' ? 'dashboard.riskFactor.weekendDay' : 'dashboard.riskFactor.thisDay'
      return { key: rule.key, params: { day: dayKey } }
    }
    return { key: rule.key, params: {} }
  }
  return null
}
