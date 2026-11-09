import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../hooks'
import { PublicLayout } from '../../layouts/PublicLayout'
import '../../styles/landing.css'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <PublicLayout>
      <main className="ll-section">
        <div className="ll-container ll-narrow ll-not-found">
          <p className="ll-eyebrow">404</p>
          <h1 className="ll-page-title">We couldn’t find that page</h1>
          <p className="ll-lede">The link may be old or the address may have been typed incorrectly.</p>
          <div className="ll-hero__actions">
            <Link to="/" className="ll-btn ll-btn--primary">Go home</Link>
            <Link to="/login" className="ll-btn ll-btn--ghost">Log in</Link>
          </div>
        </div>
      </main>
    </PublicLayout>
  )
}
