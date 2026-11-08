import { Link } from 'react-router-dom'
import { SHOW_PROTECTION } from '../protectionFlag'

export default function ProtectionTeaser() {
  if (!SHOW_PROTECTION) return null
  return (
    <section className="ll-band ll-band--warm ll-protection-teaser" aria-labelledby="ll-protection-title">
      <div className="ll-container ll-narrow">
        <p className="ll-eyebrow">In development</p>
        <h2 id="ll-protection-title" className="ll-h2">LossLens Protection: an idea we are working on</h2>
        <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
          We are researching a way for health insurance to help pay for professional treatment of
          gambling disorder. It is not available yet — this is a concept, not an offer.
        </p>
        <ul>
          <li>It would never pay betting losses or debts.</li>
          <li>A licensed insurer decides cover; clinicians decide treatment.</li>
          <li>Your diary, Oloo chats and risk scores are never shared with an insurer.</li>
        </ul>
        <Link to="/protection" className="ll-btn ll-btn--warm">Read the concept</Link>
      </div>
    </section>
  )
}
