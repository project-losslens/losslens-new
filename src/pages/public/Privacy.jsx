import { useDocumentTitle } from '../../hooks'
import { PublicLayout } from './landing/Sections'
import '../../styles/landing.css'

export default function Privacy() {
  useDocumentTitle('Privacy information')
  return (
    <PublicLayout>
      <main className="ll-section">
        <article className="ll-container ll-narrow ll-legal">
          <p className="ll-draft-banner" role="status">Draft pending legal review</p>
          <p className="ll-eyebrow">Privacy</p>
          <h1 className="ll-page-title">Your privacy</h1>
          <p className="ll-lede">This draft explains the privacy commitments currently reflected in LossLens. It is not a substitute for the final notice reviewed by counsel.</p>
          <section className="ll-page-section">
            <h2 className="ll-h2">Information you provide</h2>
            <p className="ll-lede">LossLens may process account details, diary entries, check-ins, support interactions and information you choose to share in the app. We use this information to provide the features you request.</p>
          </section>
          <section className="ll-page-section">
            <h2 className="ll-h2">AI companion</h2>
            <p className="ll-lede">Oloo is optional. The app asks for your consent before sending your chat context to the AI service. You can use other features without choosing AI chat.</p>
          </section>
          <section className="ll-page-section">
            <h2 className="ll-h2">Partners and your choices</h2>
            <p className="ll-lede">Partners receive grouped figures only; individual diaries and chats are not shared with them. You can review your information and account controls in the app and request deletion through the available account tools.</p>
          </section>
          <p className="ll-caption">Owner action: have this draft reviewed and replace it with a complete privacy notice before public launch.</p>
        </article>
      </main>
    </PublicLayout>
  )
}
