
// Single source of truth for public contact details.
// The email and phone must never appear as visible text on the site —
// use ContactIcons (icon-only links) or the helpers below.
export const SITE_ORIGIN = 'https://losslens-new.vercel.app'

export const SITE = {
  name: 'LossLens',
  url: SITE_ORIGIN,
  email: 'projectlosslens@gmail.com',
  phoneE164: '+254714428882',
  founderNote: null,   // optional; renders nothing while null (see landing Origin section)
  credibility: [],     // optional advisors/partners list supplied by the owner
}

export const mailtoHref = (subject = '') =>
  `mailto:${SITE.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`

export const telHref = () => `tel:${SITE.phoneE164}`

/* ---- facts.js ---- */
// Verified public facts for marketing copy.
// Re-verify these figures against the primary sources before the site goes public.
export const FACTS = [
  {
    id: 'adult-betting-2024',
    value: '11.2%',
    label: 'of Kenyan adults were actively betting in 2024, down from 13.9% in 2021',
    source: 'Central Bank of Kenya / KNBS / FSD Kenya, 2024 FinAccess Household Survey (Dec 2024)',
    url: 'https://www.centralbank.go.ke/wp-content/uploads/2024/12/2024-FINACCESS-HOUSEHOLD-SURVEY-MAIN-REPORT.pdf',
    verifiedOn: '2026-11-08',
  },
  {
    id: 'young-betting-2024',
    value: '14.3%',
    label: 'of 18 to 25 year olds were currently betting in 2024 — the highest-participation age band reported',
    source: 'Central Bank of Kenya / KNBS / FSD Kenya, 2024 FinAccess Household Survey (Dec 2024)',
    url: 'https://www.centralbank.go.ke/wp-content/uploads/2024/12/2024-FINACCESS-HOUSEHOLD-SURVEY-MAIN-REPORT.pdf',
    verifiedOn: '2026-11-08',
  },
  {
    id: 'sha-statement',
    value: 'April 2025',
    label: "Kenya's Ministry of Health said gambling rehabilitation is included in the Social Health Authority (SHA) benefit packages",
    source: 'The Star, 9 May 2025, "Betting surge fuels silent crisis among Kenyans"',
    url: 'https://www.the-star.co.ke/news/2025-05-09-betting-surge-fuels-silent-crisis-among-kenyans',
    verifiedOn: '2026-11-08',
  },
]
