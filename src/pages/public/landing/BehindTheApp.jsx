export default function BehindTheApp() {
  return (
    <section className="ll-band" id="behind-the-app" aria-labelledby="ll-model-title">
      <div className="ll-container">
        <div className="ll-model">
          <div>
            <h2 id="ll-model-title" className="ll-h2">A simple risk picture, kept over time</h2>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              Every diary entry feeds a simple daily risk score: recent gambling days, missed check-ins,
              stress in your own words, payday windows and the time of day. The score is shown to you
              as low, medium or high, with the reasons listed plainly.
            </p>
            <p className="ll-lede" style={{ marginBottom: 'var(--space-4)' }}>
              For insurers and employers, LossLens can share aggregate figures only — for example how a
              group&rsquo;s risk bands shift over time. Groups smaller than 25 members are never reported,
              so no individual can be picked out. Your diary, your chats and your screening answers are
              never shared.
            </p>
            <p className="ll-lede">
              This is an early model that will be calibrated with real data in a pilot. It is a prompt to
              check in, not a diagnosis and not a prediction of what you will do.
            </p>
          </div>
          <div className="ll-model__diagram">
            <svg viewBox="0 0 320 180" role="img" aria-label="Diagram: diary entries feed a daily risk score, which is grouped into low, medium and high bands">
              <rect x="8" y="60" width="86" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="51" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Diary entries</text>
              <text x="51" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">mood · triggers · spend</text>
              <line x1="94" y1="90" x2="126" y2="90" stroke="var(--primary)" strokeWidth="2" markerEnd="url(#ah)" />
              <rect x="128" y="60" width="86" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="171" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Daily risk score</text>
              <text x="171" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">0–100 · low / med / high</text>
              <line x1="214" y1="90" x2="246" y2="90" stroke="var(--primary)" strokeWidth="2" markerEnd="url(#ah)" />
              <rect x="248" y="60" width="64" height="60" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x="280" y="86" textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-body)">Aggregate</text>
              <text x="280" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-body)">groups ≥25 only</text>
              <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--primary)" /></marker></defs>
            </svg>
            <p className="ll-model__caption">What you see stays yours. Partners see grouped numbers only.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
