import NumberField from '../components/NumberField'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import GuidedTour from '../components/GuidedTour'
import { generateDemoData, DEMO_LABEL } from '../demo/fixtures'
import { computeInsurerMetrics, formatMetric, METRIC_DEFINITIONS } from '../lib/metrics'
import { isDemoEnabled } from '../lib/demoMode'

const CHECKIN_KEY = 'll-demo-checkins'
const TOUR_KEY = 'll-demo-tour-done'

const TOUR_STEPS = [
  { target: '[data-tour="home"]', title: 'Home', body: 'Greeting, streak and money saved — all computed from check-in data.' },
  { target: '[data-tour="checkin"]', title: 'Daily check-in', body: 'A 20-second mood, urge and gambling check-in. Try it — it saves on this device only.' },
  { target: '[data-tour="toolkit"]', title: 'Urge Toolkit', body: 'When an urge hits, start the 10-minute delay and ride it out with breathing and grounding.' },
  { target: '[data-tour="community"]', title: 'Community', body: 'The Circle and Whispers — peer support that is always optional and anonymous.' },
  { target: '[data-tour="insurer"]', title: 'Insurer dashboard', body: 'Grouped, de-identified metrics insurers see — never individual diary content.' },
]

function loadDemoCheckins() {
  try { return JSON.parse(localStorage.getItem(CHECKIN_KEY) || '[]') } catch { return [] }
}

export default function Demo() {
  const data = useMemo(() => generateDemoData(), [])
  const [checkins, setCheckins] = useState(loadDemoCheckins)
  const [checkinForm, setCheckinForm] = useState({ mood: 'Calm', urge: 3, gambled: false })
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [tourOpen, setTourOpen] = useState(() => {
    try { return localStorage.getItem(TOUR_KEY) !== 'done' } catch { return true }
  })

  if (!isDemoEnabled()) {
    return (
      <section className="portal-page">
        <h1>Demo mode</h1>
        <p className="portal-notice">Demo mode is disabled for this deployment.</p>
        <Link to="/login" className="btn-primary">Back to sign in</Link>
      </section>
    )
  }

  const metrics = computeInsurerMetrics({
    claims: data.claims,
    stats: data.insurerStats,
    invoices: [],
  })

  const submitCheckin = (event) => {
    event.preventDefault()
    const entry = {
      date: new Date().toISOString().slice(0, 10),
      mood: checkinForm.mood,
      urge_level: checkinForm.urge,
      gambled: checkinForm.gambled,
      demo: true,
    }
    const next = [...checkins.filter((c) => c.date !== entry.date), entry]
    try { localStorage.setItem(CHECKIN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setCheckins(next)
    setCheckinForm({ mood: 'Calm', urge: 3, gambled: false })
  }

  const startDelay = () => {
    if (delaySeconds > 0) return
    setDelaySeconds(600)
    const timer = window.setInterval(() => {
      setDelaySeconds((s) => {
        if (s <= 1) { window.clearInterval(timer); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const resetDemo = () => {
    try {
      localStorage.removeItem(CHECKIN_KEY)
      localStorage.removeItem(TOUR_KEY)
    } catch { /* ignore */ }
    setCheckins([])
    setDelaySeconds(0)
    window.location.reload()
  }

  const mm = String(Math.floor(delaySeconds / 60)).padStart(2, '0')
  const ss = String(delaySeconds % 60).padStart(2, '0')

  return (
    <section className="portal-page demo-page">
      <header className="portal-page__heading">
        <div>
          <p className="portal-page__eyebrow">Demo mode</p>
          <h1>LossLens walkthrough</h1>
        </div>
        <div className="portal-page__actions">
          <button type="button" className="btn-ghost" onClick={() => setTourOpen(true)}>Take the tour</button>
          <button type="button" className="btn-ghost" onClick={resetDemo}>Reset demo</button>
        </div>
      </header>
      <p className="portal-notice" role="note">{DEMO_LABEL}</p>

      <section className="portal-card" data-tour="home">
        <h2>{data.profile.display_name}</h2>
        <div className="portal-stats">
          <article className="portal-card"><span>Day streak</span><strong>{data.profile.streak_days}</strong></article>
          <article className="portal-card"><span>Money saved (sample)</span><strong>KES {data.profile.money_saved.toLocaleString()}</strong></article>
          <article className="portal-card"><span>Check-ins logged</span><strong>{data.diaryEntries.length}</strong></article>
        </div>
        <p className="portal-page__eyebrow">Home — greeting, streak and money saved, then today's check-in.</p>
      </section>

      <section className="portal-card" data-tour="checkin">
        <h2>Today's check-in</h2>
        <form className="portal-form" onSubmit={submitCheckin}>
          <label>Mood
            <select value={checkinForm.mood} onChange={(e) => setCheckinForm((f) => ({ ...f, mood: e.target.value }))}>
              {['Calm', 'Stressed', 'Anxious', 'Depressed', 'Happy'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Urge level (0–10)
            <NumberField inputMode="numeric" min={0} max={10} step={1} value={checkinForm.urge} onChange={(urge) => setCheckinForm((current) => ({ ...current, urge: urge ?? 0 }))} />
          </label>
          <label className="demo-check">
            <input type="checkbox" checked={checkinForm.gambled} onChange={(e) => setCheckinForm((f) => ({ ...f, gambled: e.target.checked }))} />
            I gambled today
          </label>
          <button type="submit" className="btn-primary">Save check-in</button>
        </form>
        {checkins.length > 0 && (
          <p className="portal-page__eyebrow">{checkins.length} demo check-in{checkins.length === 1 ? '' : 's'} saved on this device.</p>
        )}
      </section>

      <section className="portal-card" data-tour="toolkit">
        <h2>Urge Toolkit</h2>
        <p>When an urge hits, start the 10-minute delay before doing anything else.</p>
        {delaySeconds > 0 ? (
          <p className="demo-timer" role="timer">{mm}:{ss} remaining — ride it out.</p>
        ) : (
          <button type="button" className="btn-primary" onClick={startDelay}>Start 10-minute delay</button>
        )}
        <p className="portal-page__eyebrow">Then: breathing, grounding, or call a supporter.</p>
      </section>

      <section className="portal-card" data-tour="community">
        <h2>Community</h2>
        <div className="portal-list">
          <article className="portal-list__item"><strong>Sample post</strong><p>"Day 23 today. The urge came at 9pm and the toolkit got me through it."</p></article>
          <article className="portal-list__item"><strong>Sample post</strong><p>"Money saved passed KES 40,000. Booking the safari my kids asked for."</p></article>
          <article className="portal-list__item"><strong>Sample post</strong><p>"New here. Is it normal to feel angry at myself after a slip?"</p></article>
        </div>
        <p className="portal-page__eyebrow">The Circle and Whispers — anonymous peer support.</p>
      </section>

      <section className="portal-card" data-tour="insurer">
        <h2>Insurer dashboard (sample)</h2>
        <div className="portal-stats">
          <article className="portal-card"><span>Enrolled members</span><strong>{metrics.enrolledMembers}</strong><details className="metric-def"><summary>Definition</summary><p>{METRIC_DEFINITIONS.enrolledMembers}</p></details></article>
          <article className="portal-card"><span>Claim frequency</span><strong>{formatMetric(metrics.claimFrequency, 'frequency')}</strong><details className="metric-def"><summary>Definition</summary><p>{METRIC_DEFINITIONS.claimFrequency}</p></details></article>
          <article className="portal-card"><span>Avg cost per claim</span><strong>{formatMetric(metrics.avgCostPerClaim, 'money')}</strong><details className="metric-def"><summary>Definition</summary><p>{METRIC_DEFINITIONS.avgCostPerClaim}</p></details></article>
          <article className="portal-card"><span>Retention</span><strong>{formatMetric(metrics.retention, 'percent')}</strong><details className="metric-def"><summary>Definition</summary><p>{METRIC_DEFINITIONS.retention}</p></details></article>
        </div>
        <h3>Claims (sample)</h3>
        <div className="portal-list">
          {data.claims.slice(0, 5).map((c) => (
            <article className="portal-list__item" key={c.claim_id}>
              <div><strong>{c.claim_id}</strong><p>{c.session_date} · KES {c.claim_amount.toLocaleString()} · {c.insurer_status}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="portal-card">
        <h2>Admin analytics (sample)</h2>
        <div className="portal-stats">
          <article className="portal-card"><span>Total users</span><strong>{data.adminStats.total_users.toLocaleString()}</strong></article>
          <article className="portal-card"><span>Active this week</span><strong>{data.adminStats.active_this_week}</strong></article>
          <article className="portal-card"><span>Check-ins today</span><strong>{data.adminStats.checkins_today}</strong></article>
          <article className="portal-card"><span>Open crisis alerts</span><strong>{data.adminStats.open_crisis_alerts}</strong></article>
        </div>
      </section>

      <GuidedTour steps={TOUR_STEPS} open={tourOpen} onClose={() => setTourOpen(false)} storageKey={TOUR_KEY} />
    </section>
  )
}
