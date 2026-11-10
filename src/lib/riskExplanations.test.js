import test from 'node:test'
import assert from 'node:assert/strict'
import { explainRiskFactor } from './riskExplanations.js'
import en from '../i18n/en.js'
import sw from '../i18n/sw.js'

test('maps every relapsePrediction factor to an i18n key', () => {
  const factors = [
    'Not enough data yet. Keep logging!',
    'Weekend has been high-risk historically',
    'This day has been high-risk historically',
    'Recent gambling activity detected',
    '4 days since last diary entry',
    'Elevated stress levels in recent entries',
    'Payday period - financial triggers may be higher',
    'Weekend - historically higher gambling risk',
    'Evening hours - common trigger time',
  ]
  for (const f of factors) {
    const explained = explainRiskFactor(f)
    assert.ok(explained, `no mapping for: ${f}`)
    assert.ok(en[explained.key], `missing en key: ${explained.key}`)
    assert.ok(sw[explained.key], `missing sw key: ${explained.key}`)
  }
})

test('extracts params for parameterized factors', () => {
  assert.deepEqual(explainRiskFactor('7 days since last diary entry'), {
    key: 'dashboard.riskFactor.missedEntries',
    params: { count: '7' },
  })
  const weekend = explainRiskFactor('Weekend has been high-risk historically')
  assert.equal(weekend.key, 'dashboard.riskFactor.dayHigh')
  assert.equal(weekend.params.day, 'dashboard.riskFactor.weekendDay')
  const day = explainRiskFactor('This day has been high-risk historically')
  assert.equal(day.params.day, 'dashboard.riskFactor.thisDay')
})

test('returns null for unknown factors', () => {
  assert.equal(explainRiskFactor('Something new entirely'), null)
  assert.equal(explainRiskFactor(null), null)
  assert.equal(explainRiskFactor(42), null)
})
