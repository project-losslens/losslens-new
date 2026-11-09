import { Link } from 'react-router-dom'
import AppIcon from '../../../components/AppIcon'
import { HELPLINES, primaryHelpline } from '../../../config/helplines'

export function Hero() {
  return (
    <section className="ll-hero" aria-labelledby="ll-hero-title">
      <div className="ll-container ll-hero__grid">
        <div className="ll-hero__copy">
          <p className="ll-eyebrow">LossLens</p>
          <h1 id="ll-hero-title">Count days, not losses</h1>
          <p className="ll-hero__sub">
            A private recovery companion for people in Kenya who want to stop gambling:
            a diary, support and practical tools in your pocket.
          </p>
          <div className="ll-hero__actions">
            <Link to="/signup" className="ll-btn ll-btn--primary">Get started</Link>
            <Link to="/#how-it-works" className="ll-btn ll-btn--ghost">How it works</Link>
          </div>
          <p className="ll-hero__crisis">
            In crisis? Call{' '}
            <a href={`tel:${primaryHelpline.tel}`}>
              {primaryHelpline.name} {primaryHelpline.phone}
            </a>
          </p>
        </div>
        <div className="ll-hero__visual">
          <svg className="ll-lens" viewBox="0 0 360 360" aria-hidden="true" focusable="false">
            <circle className="ll-lens__ring ll-lens__ring--faint" cx="180" cy="180" r="168" />
            <circle className="ll-lens__ring" cx="180" cy="180" r="132" />
            <circle className="ll-lens__ring ll-lens__ring--faint" cx="180" cy="180" r="96" />
            <circle className="ll-lens__ring" cx="180" cy="180" r="60" />
            <g transform="rotate(200 180 180)">
              <circle className="ll-lens__arc" cx="180" cy="180" r="132" />
            </g>
            {[
              [56, 135], [79, 95], [114, 66], [157, 50],
              [203, 50], [246, 66], [281, 95], [304, 135],
            ].map(([cx, cy], index) => (
              <circle className="ll-lens__dot" key={index} cx={cx} cy={cy} r="3.5" />
            ))}
          </svg>
          <div className="ll-phone">
            <span className="ll-phone__sample">Sample</span>
            <p className="ll-phone__day"><strong>Day 14</strong></p>
            <p className="ll-phone__saved">KES 4,200 saved</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function About() {
  return (
    <section className="ll-section" aria-labelledby="ll-about-title">
      <div className="ll-container ll-about__grid">
        <div className="ll-about__intro">
          <p className="ll-eyebrow">About LossLens</p>
          <h2 id="ll-about-title">A private place to start over</h2>
        </div>
        <div className="ll-about__body">
          <p>
            LossLens is a free, private recovery companion for people affected by betting
            in Kenya. It brings a daily diary, coping tools and peer support into one
            place, so you can notice patterns and take one small step at a time.
          </p>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: 'diary', title: 'Diary', body: 'A quick private check-in on moods, triggers and choices.' },
  { icon: 'chat', title: 'Oloo', body: 'An AI companion that helps you reflect, with your consent.' },
  { icon: 'toolkit', title: 'Urge Toolkit', body: 'Simple exercises to help you ride out an urge.' },
  { icon: 'users', title: 'The Circle', body: 'Anonymous peer rooms for support and encouragement.' },
  { icon: 'brain', title: 'CBT Modules', body: 'Short lessons on patterns, thoughts and coping skills.' },
  { icon: 'profile', title: 'Family Portal', body: 'Share selected updates with someone you trust.' },
]

export function Features() {
  return (
    <section className="ll-section ll-section--tint" id="features" aria-labelledby="ll-features-title">
      <div className="ll-container">
        <p className="ll-eyebrow">What is inside</p>
        <h2 id="ll-features-title">Tools for your pace</h2>
        <div className="ll-features">
          {FEATURES.map((feature) => (
            <article className="ll-feature" key={feature.title}>
              <span className="ll-feature__icon"><AppIcon name={feature.icon} size={20} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Check in', body: 'Record what is going on for you, one day at a time.' },
  { title: 'Notice patterns', body: 'Use your reflections to understand triggers and progress.' },
  { title: 'Choose support', body: 'Try a tool, talk to Oloo or connect with peers.' },
]

const PROMISES = [
  'Your diary is private to you.',
  'Oloo only uses your chat data with your consent.',
  'Partners see grouped numbers, not your personal diary or chats.',
]

export function HowItWorks() {
  return (
    <section className="ll-section" id="how-it-works" aria-labelledby="ll-steps-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Small steps count</p>
        <h2 id="ll-steps-title">How it works</h2>
        <div className="ll-steps">
          {STEPS.map((step, index) => (
            <article className="ll-step" key={step.title}>
              <span className="ll-step__number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <ul className="ll-promises">
          {PROMISES.map((promise) => <li key={promise}>{promise}</li>)}
        </ul>
        <Link to="/privacy" className="ll-text-link">Read our privacy information</Link>
      </div>
    </section>
  )
}

export function ClosingCTA() {
  return (
    <section className="ll-section ll-cta" aria-labelledby="ll-cta-title">
      <div className="ll-container ll-cta__inner">
        <div>
          <p className="ll-eyebrow">Start when you are ready</p>
          <h2 id="ll-cta-title">Start free today</h2>
          <p className="ll-lede">Create a private account and begin with a check-in. You can explore at your own pace.</p>
        </div>
        <Link to="/signup" className="ll-btn ll-btn--primary">Get started</Link>
      </div>
    </section>
  )
}

export function CrisisStrip() {
  return (
    <section className="ll-crisis" id="crisis-help" aria-labelledby="ll-crisis-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Support is available</p>
        <h2 id="ll-crisis-title">Need help right now?</h2>
        <p className="ll-lede">These helplines are available without a LossLens account.</p>
        <div className="ll-crisis__list">
          {HELPLINES.map((line) => (
            <a className="ll-crisis__item" href={`tel:${line.tel}`} key={line.id}>
              <span><strong>{line.name}</strong><small>{line.hours}</small></span>
              <span className="ll-crisis__number">{line.phone}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
