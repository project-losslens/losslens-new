import test from 'node:test'
import assert from 'node:assert/strict'
import { generateDiaryEntries, computeStreak, computeMoneySaved, generateDemoData } from './fixtures.js'

test('generateDiaryEntries produces 45 days minus one missed day', () => {
  const entries = generateDiaryEntries(45)
  assert.equal(entries.length, 44)
  const dates = new Set(entries.map((e) => e.date))
  assert.equal(dates.size, entries.length)
  for (const e of entries) {
    assert.ok(e.date.match(/^\d{4}-\d{2}-\d{2}$/))
    assert.ok(e.urge_level >= 0 && e.urge_level <= 10)
    assert.equal(typeof e.gambled, 'boolean')
  }
})

test('fixtures are deterministic', () => {
  const a = generateDemoData()
  const b = generateDemoData()
  assert.deepEqual(a.diaryEntries, b.diaryEntries)
  assert.equal(a.profile.streak_days, b.profile.streak_days)
  assert.equal(a.profile.money_saved, b.profile.money_saved)
})

test('computeStreak counts consecutive days ending today or yesterday', () => {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  assert.equal(computeStreak([{ date: today }, { date: yesterday }, { date: dayBefore }]), 3)
  // gap breaks the streak
  assert.equal(computeStreak([{ date: today }, { date: dayBefore }]), 1)
  // empty history
  assert.equal(computeStreak([]), 0)
})

test('computeMoneySaved rewards clean days and subtracts losses', () => {
  const entries = [
    { date: '2026-01-01', gambled: false },
    { date: '2026-01-02', gambled: false },
    { date: '2026-01-03', gambled: true },
  ]
  // 2 clean × 500 - 1 gambling × 500 = 500
  assert.equal(computeMoneySaved(entries, 500), 500)
  assert.equal(computeMoneySaved([], 500), 0)
  // never negative
  assert.equal(computeMoneySaved([{ date: 'x', gambled: true }], 100), 0)
})
