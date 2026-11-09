import { useDocumentTitle } from '../../hooks'
import { PublicLayout } from '../../layouts/PublicLayout'
import '../../styles/landing.css'

export default function Terms() {
  useDocumentTitle('Terms of use')
  return (
    <PublicLayout>
      <main className="ll-section">
        <article className="ll-container ll-narrow ll-legal">
          <p className="ll-draft-banner" role="status">Draft pending legal review</p>
          <p className="ll-eyebrow">Terms</p>
          <h1 className="ll-page-title">Terms of use</h1>
          <p className="ll-lede">These draft terms describe the intended use of LossLens and require legal review before public launch.</p>
          <section className="ll-page-section">
            <h2 className="ll-h2">What LossLens provides</h2>
            <p className="ll-lede">LossLens provides self-guided reflection and peer-support tools. It is not a gambling service, financial product, insurance company, medical provider or substitute for professional care.</p>
          </section>
          <section className="ll-page-section">
            <h2 className="ll-h2">Your account</h2>
            <p className="ll-lede">Use accurate account information, keep your sign-in details private and use the service lawfully. Do not use the platform to threaten, harass or expose another person.</p>
          </section>
          <section className="ll-page-section">
            <h2 className="ll-h2">Availability and support</h2>
            <p className="ll-lede">Features may change as the service develops. If you need urgent help, use the crisis helplines listed on this site rather than relying on an app response.</p>
          </section>
          <p className="ll-caption">Owner action: replace this draft with counsel-approved terms before public launch.</p>
        </article>
      </main>
    </PublicLayout>
  )
}
