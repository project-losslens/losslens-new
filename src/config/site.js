// Single source of truth for public contact details.
// The email and phone must never appear as visible text on the site —
// use ContactIcons (icon-only links) or the helpers below.
export const SITE = {
  name: 'LossLens',
  url: 'https://losslens.mu.vercel.app',
  email: 'projectlosslens@gmail.com',
  phoneE164: '+254714428882',
  founderNote: null,   // optional; renders nothing while null (see landing Origin section)
  credibility: [],     // optional advisors/partners list supplied by the owner
}

export const mailtoHref = (subject = '') =>
  `mailto:${SITE.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`

export const telHref = () => `tel:${SITE.phoneE164}`
