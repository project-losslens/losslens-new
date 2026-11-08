import { Link } from 'react-router-dom'
import ContactIcons from '../../../components/ContactIcons'

export default function Partners() {
  return (
    <section className="ll-band ll-band--surface" id="partners" aria-labelledby="ll-partners-title">
      <div className="ll-container">
        <h2 id="ll-partners-title" className="ll-h2">For insurers, employers and clinicians</h2>
        <p className="ll-lede" style={{ marginBottom: 'var(--space-6)' }}>
          LossLens is built to work alongside the people who fund and deliver care —
          with privacy designed in from the start.
        </p>
        <div className="ll-partners">
          <article className="ll-partner">
            <h3>For insurers and sponsors</h3>
            <p>We are looking for a licensed insurer or sponsor to run a small pilot.</p>
            <ul>
              <li>Aggregate-only risk analytics; groups smaller than 25 members are never reported.</li>
              <li>No individual diaries, chats or screening answers are ever shared.</li>
              <li>LossLens is not an insurance company. We would work with licensed insurers.</li>
            </ul>
            <div className="ll-partner__actions">
              <ContactIcons subject="Insurer pilot enquiry" />
              <Link to="/insurer/login" style={{ color: 'var(--primary)', fontSize: 'var(--step--1)' }}>Insurer log in</Link>
            </div>
          </article>
          <article className="ll-partner">
            <h3>For therapists</h3>
            <p>LossLens is building a network of qualified clinicians. Sessions can be
            pre-approved and claims are tracked in the platform.</p>
            <ul>
              <li>Refer clients into structured support tools.</li>
              <li>Track sessions and claims without leaving the platform.</li>
            </ul>
            <div className="ll-partner__actions">
              <ContactIcons subject="Therapist network enquiry" />
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
