import AppIcon from './AppIcon.jsx'
import { mailtoHref, telHref } from '../config/site'

// Icon-only contact links. The email address and phone number are never
// rendered as visible text — they live only in src/config/site.js.
export default function ContactIcons({ subject = '', size = 20, tone = 'default', className = '' }) {
  const title = subject ? `Email LossLens: ${subject}` : 'Email LossLens'
  return (
    <span className={`contact-icons contact-icons--${tone}${className ? ` ${className}` : ''}`}>
      <a
        className="contact-icons__link"
        href={mailtoHref(subject)}
        aria-label="Email LossLens"
        title={title}
      >
        <AppIcon name="mail" size={size} />
      </a>
      <a
        className="contact-icons__link"
        href={telHref()}
        aria-label="Call LossLens"
        title="Call LossLens"
      >
        <AppIcon name="phone" size={size} />
      </a>
    </span>
  )
}
