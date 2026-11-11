// Demo fixtures — deterministic sample data for /demo.
// Plain JS, no JSX, no import.meta.env: fixtures only, never touches the
// database. All copy is labelled "Sample".

export const DEMO_LABEL = 'Sample data — demo mode. Nothing here is saved to a real account.'

// Deterministic PRNG so the demo looks identical on every run.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MOODS = ['Calm', 'Stressed', 'Anxious', 'Depressed', 'Happy']
const SAMPLE_NOTES = [
  'Felt the urge after payday. Used the breathing tool instead.',
  'Quiet day. Walked instead of opening the betting app.',
  'Stressful meeting at work. Urge peaked but passed.',
  'Called my supporter. Felt lighter afterwards.',
  'Skipped the usual Friday bet. Small win.',
]

function isoDate(offsetDays) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

export function generateDiaryEntries(days = 45) {
  const rand = mulberry32(20261110)
  const entries = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = isoDate(i)
    // One missed day mid-way so the streak story is realistic.
    if (i === 12) continue
    const gambled = rand() < 0.16
    const mood = gambled
      ? MOODS[Math.floor(rand() * 3)] // stressed/anxious/depressed
      : MOODS[Math.floor(rand() * MOODS.length)]
    entries.push({
      date,
      mood,
      urge_level: Math.floor(rand() * 11),
      gambled,
      note: rand() < 0.4 ? SAMPLE_NOTES[Math.floor(rand() * SAMPLE_NOTES.length)] : null,
    })
  }
  return entries
}

export function computeStreak(entries) {
  const days = new Set(entries.map((e) => e.date))
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  // Today may not be logged yet — streak counts from yesterday in that case.
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function computeMoneySaved(entries, avgBetPerGamblingDay = 500) {
  // Money saved = gambling days avoided × typical bet, minus what was lost.
  const gamblingDays = entries.filter((e) => e.gambled).length
  const cleanDays = entries.length - gamblingDays
  const avoided = cleanDays * avgBetPerGamblingDay
  const lost = gamblingDays * avgBetPerGamblingDay
  return Math.max(0, avoided - lost)
}

export function generateDemoData() {
  const diaryEntries = generateDiaryEntries(45)
  const claims = Array.from({ length: 14 }, (_, i) => {
    const rand = mulberry32(777 + i)
    const statuses = ['paid', 'paid', 'approved', 'submitted', 'submitted', 'rejected']
    const insurerStatus = statuses[Math.floor(rand() * statuses.length)]
    const sessionOffset = Math.floor(rand() * 90)
    return {
      claim_id: `demo-claim-${String(i + 1).padStart(3, '0')}`,
      session_date: isoDate(sessionOffset),
      claim_amount: 1500 + Math.floor(rand() * 20) * 250,
      claim_status: 'approved',
      insurer_status: insurerStatus,
      insurer_notes: insurerStatus === 'rejected' ? 'Sample: outside covered session criteria.' : null,
      submitted_at: new Date(Date.now() - sessionOffset * 86400000).toISOString(),
    }
  }).sort((a, b) => b.session_date.localeCompare(a.session_date))

  return {
    label: DEMO_LABEL,
    profile: {
      display_name: 'Demo Member',
      streak_days: computeStreak(diaryEntries),
      money_saved: computeMoneySaved(diaryEntries),
      risk_level: 'medium',
    },
    diaryEntries,
    claims,
    insurerStats: {
      cohort_size: 34,
      active_members: 29,
      claims_last_30d: 5,
      claims_last_90d: 14,
      avg_claim_amount: claims.reduce((s, c) => s + c.claim_amount, 0) / claims.length,
      total_paid_last_90d: claims.filter((c) => c.insurer_status === 'paid').reduce((s, c) => s + c.claim_amount, 0),
      tier_mix: { free: 18, premium: 11, company: 5 },
      aggregate_markov_state: { low: 12, medium: 15, high: 7 },
    },
    adminStats: {
      total_users: 1284,
      active_this_week: 412,
      checkins_today: 96,
      open_crisis_alerts: 3,
      claims_in_pipeline: 27,
    },
    protection: {
      label: 'Sample Protection data — never written to the database.',
      insurer: { name: 'Sample Insurance SACCO', plan: 'Sample Family Cover', member_ref_prefix: 'SMPL-' },
      therapists: [
        { name: 'Sample Therapist A', county: 'Nairobi', languages: ['English', 'Kiswahili'], telehealth: true, fee: 2500, status: 'active' },
        { name: 'Sample Therapist B', county: 'Mombasa', languages: ['English', 'Kiswahili'], telehealth: false, fee: 2000, status: 'active' },
        { name: 'Sample Therapist C', county: 'Kisumu', languages: ['English', 'Dholuo'], telehealth: true, fee: 1800, status: 'pending' },
      ],
      memberships: [
        { member_ref: 'SMPL-0001', status: 'pending_verification' },
        { member_ref: 'SMPL-0002', status: 'active' },
        { member_ref: 'SMPL-0003', status: 'active' },
        { member_ref: 'SMPL-0004', status: 'suspended' },
        { member_ref: 'SMPL-0005', status: 'ended' },
        { member_ref: 'SMPL-0006', status: 'rejected' },
      ],
      claims: [
        { ref: 'SMPL-C-001', state: 'pre-authorisation requested' },
        { ref: 'SMPL-C-002', state: 'pre-authorisation approved' },
        { ref: 'SMPL-C-003', state: 'session completed' },
        { ref: 'SMPL-C-004', state: 'claim submitted' },
        { ref: 'SMPL-C-005', state: 'claim approved — awaiting payout' },
        { ref: 'SMPL-C-006', state: 'claim paid' },
        { ref: 'SMPL-C-007', state: 'claim rejected' },
      ],
    },
  }
}
