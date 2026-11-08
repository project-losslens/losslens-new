import { SITE } from '../../../config/site'

export default function Origin() {
  if (!SITE.founderNote) return null
  return (
    <section className="ll-band ll-origin" aria-labelledby="ll-origin-title">
      <div className="ll-container ll-narrow ll-center">
        <h2 id="ll-origin-title" className="ll-h2">Why we built this</h2>
        <blockquote>{SITE.founderNote}</blockquote>
        {SITE.credibility?.length > 0 && (
          <p className="ll-lede ll-center" style={{ marginInline: 'auto' }}>
            {SITE.credibility.join(' · ')}
          </p>
        )}
      </div>
    </section>
  )
}
