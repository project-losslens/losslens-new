import LogoMark from '../../../components/LogoMark'

export default function Hero({ onSignup }) {
  return (
    <section className="ll-hero" aria-labelledby="ll-hero-title">
      <LogoMark size={560} className="ll-hero__motif" petalClass="" />
      <div className="ll-hero__grid">
        <div>
          <h1 id="ll-hero-title">Get a grip on your betting, privately and for free.</h1>
          <p className="ll-hero__sub">
            LossLens is a free recovery companion for people affected by betting in Kenya.
            Log your days, talk to Oloo when the urge hits, and find people who understand —
            without anyone knowing it is you.
          </p>
          <div className="ll-hero__actions">
            <button type="button" className="ll-btn ll-btn--primary" onClick={onSignup}>Start free</button>
            <a className="ll-btn ll-btn--ghost" href="#how-it-works">See how it works</a>
          </div>
          <p className="ll-hero__trust">
            <span>Private by design</span>
            <span>Anonymous peer rooms</span>
            <span>Free core features</span>
          </p>
        </div>
        <div>
          <div className="ll-phone" role="img" aria-label="Sample screen of the LossLens app">
            <div className="ll-phone__screen">
              <div className="ll-phone__bar"><span>LossLens</span><span>Today</span></div>
              <div className="ll-phone__body">
                <div className="ll-mock-streak"><strong>6</strong><span>day streak</span></div>
                <div className="ll-mock-card">
                  <small>Diary</small>
                  <p>Logged at 23:40. Urge passed after the breathing exercise.</p>
                </div>
                <div className="ll-mock-chat">
                  <small>Oloo</small>
                  <p>That was a hard night. Want to talk about what triggered it?</p>
                </div>
              </div>
            </div>
          </div>
          <p className="ll-phone__label">Sample screen</p>
        </div>
      </div>
    </section>
  )
}
