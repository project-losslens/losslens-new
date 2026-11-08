import AppIcon from '../../../components/AppIcon'

const GROUPS = [
  {
    name: 'Track',
    items: [
      { icon: 'diary', name: 'Diary', line: 'Log mood, triggers and spending in a couple of minutes a day.', lead: true },
      { icon: 'home', name: 'Dashboard', line: 'Your streak, money saved and a simple risk picture over time.' },
      { icon: 'toolkit', name: 'Urge Toolkit', line: 'Breathing, timers and thought exercises for the moment an urge hits.' },
    ],
  },
  {
    name: 'Talk',
    items: [
      { icon: 'chat', name: 'Oloo', line: 'An AI companion that remembers what you tell it and checks in with you.', lead: true },
      { icon: 'users', name: 'The Circle', line: 'Anonymous rooms for check-ins, urge support and celebrating clean days.' },
      { icon: 'users', name: 'Whispers', line: 'Get matched with a peer for a private, time-limited anonymous chat.' },
    ],
  },
  {
    name: 'Reflect',
    items: [
      { icon: 'brain', name: 'CBT Modules', line: 'Structured lessons on triggers, distorted thinking and coping.' },
      { icon: 'profile', name: 'Monthly Mirror', line: 'Record a short monthly reflection and watch what changes.' },
      { icon: 'document', name: 'LossLens Pact', line: 'Record a message to your future self for the hard days.' },
    ],
  },
  {
    name: 'Reach out',
    items: [
      { icon: 'calendar', name: 'Events', line: 'Support groups and workshops you can RSVP to.' },
      { icon: 'resources', name: 'Resources', line: 'Helplines, self-exclusion tools and practical guides.' },
      { icon: 'users', name: 'Family Portal', line: 'Invite someone you trust; they see only what you choose to share.' },
    ],
  },
]

export default function WhatItDoes() {
  return (
    <section className="ll-band" id="what-it-does" aria-labelledby="ll-features-title">
      <div className="ll-container">
        <h2 id="ll-features-title" className="ll-h2">What LossLens actually does</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          Everything below is in the app today. Feature names match what you will see after signing up.
        </p>
        {GROUPS.map((g) => (
          <div key={g.name} style={{ marginBottom: 'var(--space-6)' }}>
            <p className="ll-feature__group" style={{ marginBottom: 'var(--space-3)' }}>{g.name}</p>
            <div className="ll-features">
              {g.items.map((f) => (
                <article className={`ll-feature${f.lead ? ' ll-feature--lead' : ''}`} key={f.name}>
                  <span className="ll-feature__icon"><AppIcon name={f.icon} size={20} /></span>
                  <h3>{f.name}</h3>
                  <p>{f.line}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
        <p style={{ marginTop: 'var(--space-5)' }}>
          <a href="#pricing" className="ll-btn ll-btn--ghost">See plans</a>
        </p>
      </div>
    </section>
  )
}
