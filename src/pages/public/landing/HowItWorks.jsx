const STEPS = [
  { title: 'Check in each day', body: 'A two-minute diary entry: mood, triggers, what you spent. Small and honest beats perfect.' },
  { title: 'Notice your patterns', body: 'The dashboard and risk picture show when urges cluster — payday, weekends, late nights.' },
  { title: 'Talk when it hits', body: 'Oloo and the Urge Toolkit are there in the moment, not after it.' },
  { title: 'Reach people', body: 'The Circle, Whispers and your Family Portal keep you connected to humans who get it.' },
]

export default function HowItWorks() {
  return (
    <section className="ll-band ll-band--surface" id="how-it-works" aria-labelledby="ll-steps-title">
      <div className="ll-container">
        <h2 id="ll-steps-title" className="ll-h2">How it works</h2>
        <div className="ll-steps">
          {STEPS.map((s) => (
            <div className="ll-step" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
