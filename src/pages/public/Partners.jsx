import { Link } from 'react-router-dom'
import ContactIcons from '../../components/ContactIcons'
import { useDocumentTitle } from '../../hooks'
import { PublicLayout } from './landing/Sections'
import '../../styles/landing.css'

export default function Partners() {
  useDocumentTitle('Partners')

  return (
    <PublicLayout>
      <main className="ll-section">
        <div className="ll-container">
          <p className="ll-eyebrow">Working together</p>
          <h1 className="ll-page-title">For partners</h1>
          <p className="ll-lede">LossLens is being developed alongside people who fund and deliver care, with privacy designed in from the start.</p>
          <div className="ll-partners">
            <section className="ll-partner" id="insurers">
              <h2>For insurers and employers</h2>
              <p>We are looking for a licensed insurer or sponsor to run a small pilot.</p>
              <ul>
                <li>Partners see aggregate figures only; groups smaller than 25 members are not reported.</li>
                <li>Individual diaries, chats and screening answers are not shared with partners.</li>
                <li>LossLens is not an insurance company and does not provide insurance.</li>
              </ul>
              <div className="ll-partner__actions">
                <ContactIcons subject="Insurer or employer partnership enquiry" />
                <Link to="/insurer/login" className="ll-text-link">Insurer log in</Link>
              </div>
            </section>
            <section className="ll-partner" id="therapists">
              <h2>For therapists</h2>
              <p>LossLens is building a network of qualified clinicians. Sessions can be pre-approved and claims tracked in the platform.</p>
              <ul>
                <li>Refer clients to structured support tools.</li>
                <li>Track sessions and claims in the platform.</li>
              </ul>
              <ContactIcons subject="Therapist network enquiry" />
            </section>
          </div>
        </div>
      </main>
    </PublicLayout>
  )
}
