import { Link } from 'react-router-dom'
import ContactIcons from '../../../components/ContactIcons'
import { SHOW_PROTECTION } from '../protectionFlag'
import { primaryHelpline } from '../../../config/helplines'

const LINKS = [
  { to: '/login', label: 'Log in' },
  { to: '/signup', label: 'Sign up' },
  { to: '/pricing', label: 'Pricing' },
  ...(SHOW_PROTECTION ? [{ to: '/protection', label: 'Protection' }] : []),
  { to: '/insurer/login', label: 'For insurers' },
  { href: '#partners', label: 'For therapists' },
  { href: '#contact', label: 'Contact' },
  { href: '#crisis', label: 'Crisis help' },
]

export default function Footer() {
  return (
    <footer className="ll-footer">
      <div className="ll-footer__inner">
        <div className="ll-footer__links">
          {LINKS.map((l) => (
            'to' in l
              ? <Link key={l.label} to={l.to}>{l.label}</Link>
              : <a key={l.label} href={l.href}>{l.label}</a>
          ))}
        </div>
        <ContactIcons tone="on-dark" subject="Footer enquiry" />
        <div className="ll-footer__crisis">
          In crisis? Call <a href={`tel:${primaryHelpline.tel}`}>{primaryHelpline.name} {primaryHelpline.phone}</a>{' '}
          or <a href="tel:1192">NACADA 1192</a> — free, 24/7. If you are in danger, call the helplines above.
        </div>
        <p>© 2026 LossLens · Gambling harm reduction · Kenya</p>
        <p>LossLens is not an insurance company. We would work with licensed insurers.</p>
        <p>
          <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
          {' · '}
          <Link to="/terms" style={{ color: 'inherit' }}>Terms</Link>
        </p>
      </div>
    </footer>
  )
}
