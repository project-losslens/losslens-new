import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppIcon from '../../../components/AppIcon'
import { FACTS, SITE, mailtoHref } from '../../../config/site'
import { HELPLINES, primaryHelpline } from '../../../config/helplines'
import { PLAN_META, PLANS } from '../../../config/plans'

/* ------------------------------------------------------------------ */
/* 1 — Hero                                                            */
/* ------------------------------------------------------------------ */
export function Hero() {
  return (
    <section className="ll-hero" aria-labelledby="ll-hero-title">
      <div className="ll-container ll-hero__grid">
        <div className="ll-hero__copy">
          <p className="ll-eyebrow">LossLens · Kenya</p>
          <h1 id="ll-hero-title">Count days, not losses</h1>
          <p className="ll-hero__sub">
            A private gambling-recovery companion for people in Kenya affected by
            harmful betting. Practical tools, honest reflection and real support —
            in one place, at your own pace.
          </p>
          <div className="ll-hero__actions">
            <Link to="/signup" className="ll-btn ll-btn--primary">Get started free</Link>
            <Link to="/#how-it-works" className="ll-btn ll-btn--ghost">Explore how it works</Link>
          </div>
          <p className="ll-hero__crisis">
            In crisis? Call{' '}
            <a href={`tel:${primaryHelpline.tel}`}>
              {primaryHelpline.name} {primaryHelpline.phone}
            </a>{' '}
            — no account needed.
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
            <p className="ll-phone__note">Mood logged · Urge rode out</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 2 — Why LossLens exists                                             */
/* ------------------------------------------------------------------ */
export function WhyExists() {
  return (
    <section className="ll-section" id="why" aria-labelledby="ll-why-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Why LossLens exists</p>
        <h2 id="ll-why-title">Betting harm is real — and support is thin</h2>
        <div className="ll-why__grid">
          <div className="ll-why__body">
            <p>
              Harmful betting is a quiet crisis in Kenya. People lose money they
              cannot afford, hide it from the people closest to them, and often
              have nowhere private to turn. Stigma keeps many from asking for
              help at all — and formal treatment can be expensive or hard to
              reach.
            </p>
            <p>
              LossLens was built to fill that gap: a private, structured place
              where someone can reflect honestly, learn practical coping skills,
              talk things through with an AI companion, and connect with peers —
              without judgement and without an account standing between them and
              the tools.
            </p>
          </div>
          <div className="ll-facts">
            {FACTS.map((fact) => (
              <figure className="ll-fact" key={fact.id}>
                <span className="ll-fact__value">{fact.value}</span>
                <figcaption className="ll-fact__label">{fact.label}</figcaption>
                <a className="ll-fact__source" href={fact.url} target="_blank" rel="noreferrer">
                  Source: {fact.source} · verified {fact.verifiedOn}
                </a>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 3 — Ecosystem                                                       */
/* ------------------------------------------------------------------ */
const ECOSYSTEM = [
  { icon: 'diary', title: 'Reflect', body: 'The Diary captures daily check-ins so patterns become visible.' },
  { icon: 'toolkit', title: 'Cope', body: 'The Urge Toolkit gives practical exercises for the hard moments.' },
  { icon: 'brain', title: 'Learn', body: 'CBT Modules teach structured skills for thoughts and behaviour.' },
  { icon: 'chat', title: 'Talk', body: 'Oloo offers guided conversation and supported actions.' },
  { icon: 'users', title: 'Connect', body: 'The Circle and Whispers provide peer support at different levels of openness.' },
  { icon: 'shield', title: 'Protect', body: 'LossLens Protection is a proposed treatment benefit — explained separately below.' },
]

export function Ecosystem() {
  return (
    <section className="ll-section ll-section--tint" aria-labelledby="ll-eco-title">
      <div className="ll-container">
        <p className="ll-eyebrow">One platform, working together</p>
        <h2 id="ll-eco-title">What LossLens brings together</h2>
        <p className="ll-lede">
          Recovery is not a single feature. LossLens combines reflection, coping
          skills, learning, conversation and community so each piece supports
          the others.
        </p>
        <div className="ll-eco">
          {ECOSYSTEM.map((item) => (
            <article className="ll-eco__item" key={item.title}>
              <span className="ll-eco__icon"><AppIcon name={item.icon} size={22} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4 — Feature catalogue                                               */
/* ------------------------------------------------------------------ */
const FEATURE_GROUPS = [
  {
    title: 'Daily reflection',
    items: [
      {
        icon: 'diary', title: 'Recovery Diary',
        body: 'A quick private check-in each day: mood, triggers, coping choices, thoughts, notes and gambling-related details. The diary exists so you can see your own patterns — not to judge them.',
      },
      {
        icon: 'diamond', title: 'Precious Pact',
        body: 'A personal commitment you write to yourself, with the option to record your reasons aloud. It is a private anchor for the days you need it.',
      },
      {
        icon: 'target', title: 'Monthly Mirror',
        body: 'A monthly reflection and recording space for looking back honestly at the month — what happened, what helped, what you want next.',
      },
      {
        icon: 'analytics', title: 'Recovery Report',
        body: 'A summary of your check-ins, streaks and progress signals. It is app-generated information for your own reflection — not a clinical diagnosis.',
      },
    ],
  },
  {
    title: 'Skills and support',
    items: [
      {
        icon: 'brain', title: 'CBT Modules',
        body: 'Eight structured modules covering thoughts, behaviours and coping skills, drawn from cognitive behavioural therapy. They teach skills; they are not a substitute for professional treatment.',
      },
      {
        icon: 'toolkit', title: 'Urge Toolkit',
        body: 'Practical exercises for riding out an urge: breathing, grounding, delaying tactics and other coping tools you can use in the moment.',
      },
      {
        icon: 'chat', title: 'Oloo', body: 'An AI companion for reflection and platform help — covered in its own section below.',
      },
      {
        icon: 'profile', title: 'Family Portal',
        body: 'Invite someone you trust to see selected updates about your recovery, on your terms. Sharing is limited to what you choose to share.',
      },
    ],
  },
  {
    title: 'Community and resources',
    items: [
      {
        icon: 'users', title: 'The Circle',
        body: 'Peer-support rooms where members share encouragement and experience. Participation is moderated, but like any community space it cannot guarantee absolute anonymity or safety.',
      },
      {
        icon: 'heart', title: 'Whispers',
        body: 'A private matching space for one-to-one peer support, designed so conversations stay between matched members.',
      },
      {
        icon: 'calendar', title: 'Events',
        body: 'Community events and sessions with details and RSVP, so members can connect beyond the app.',
      },
      {
        icon: 'resources', title: 'Resources & Support',
        body: 'Educational material and support routes — including a way to contact the team and track support requests when signed in.',
      },
    ],
  },
]

export function Features() {
  return (
    <section className="ll-section" id="features" aria-labelledby="ll-features-title">
      <div className="ll-container">
        <p className="ll-eyebrow">What is inside</p>
        <h2 id="ll-features-title">Tools for every part of recovery</h2>
        {FEATURE_GROUPS.map((group) => (
          <div className="ll-feature-group" key={group.title}>
            <h3 className="ll-feature-group__title">{group.title}</h3>
            <div className="ll-features">
              {group.items.map((feature) => (
                <article className="ll-feature" key={feature.title}>
                  <span className="ll-feature__icon"><AppIcon name={feature.icon} size={20} /></span>
                  <h4>{feature.title}</h4>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
        <p className="ll-note">
          Feature availability can depend on your plan and the current release.
          LossLens is a support platform — it is not a clinic and does not provide
          medical treatment.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 5 — Oloo                                                            */
/* ------------------------------------------------------------------ */
const OLOO_ACTIONS = [
  ['Diary', 'Log an entry for you after you confirm the details, or show your recent entries.'],
  ['Events', 'List upcoming events, show details, register your interest or check your RSVPs.'],
  ['CBT progress', 'Tell you which modules you have started and completed.'],
  ['Navigation', 'Take you to the Diary, Toolkit, Circle, Events, Protection or other pages.'],
  ['Protection', 'Show your membership status, cover and claim updates where the programme is enabled.'],
  ['Subscriptions', 'Show your plan and available options, and start a Premium M-Pesa checkout after you confirm.'],
]

const OLOO_LIMITS = [
  'Oloo cannot diagnose any condition or replace a clinician or emergency support.',
  'Oloo cannot approve insurance claims, change roles, or act as an administrator.',
  'Oloo only sees your own data — never another member\u2019s private information.',
  'Consequential actions always ask for your confirmation first, and nothing is confirmed until the system confirms it.',
]

export function OlooSection() {
  return (
    <section className="ll-section ll-section--oloo" id="oloo" aria-labelledby="ll-oloo-title">
      <div className="ll-container ll-oloo__grid">
        <div className="ll-oloo__copy">
          <p className="ll-eyebrow">Meet Oloo</p>
          <h2 id="ll-oloo-title">An AI companion that actually helps you use the app</h2>
          <p>
            Oloo is LossLens\u2019s conversational assistant. It can reflect with you,
            explain how things work, and — with your confirmation — help you take
            supported actions inside the platform.
          </p>
          <p>
            Ask it to log how today went, find an event, check your CBT progress,
            or open the page you need. When an action matters — like registering
            for an event or starting a payment — Oloo shows you exactly what it
            will do and waits for your go-ahead.
          </p>
        </div>
        <div className="ll-oloo__panel">
          <h3 className="ll-oloo__panel-title">What Oloo can do today</h3>
          <ul className="ll-oloo__actions">
            {OLOO_ACTIONS.map(([name, body]) => (
              <li key={name}><strong>{name}:</strong> {body}</li>
            ))}
          </ul>
          <h3 className="ll-oloo__panel-title">What Oloo will never do</h3>
          <ul className="ll-oloo__limits">
            {OLOO_LIMITS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 6 — How LossLens works                                              */
/* ------------------------------------------------------------------ */
const STEPS = [
  { title: 'Create your account', body: 'Sign up free and complete a short onboarding so the tools fit you.' },
  { title: 'Check in daily', body: 'Use the Diary to record mood, triggers and choices — one entry at a time.' },
  { title: 'Learn and practise', body: 'Work through CBT modules and try Urge Toolkit exercises when you need them.' },
  { title: 'Talk it through', body: 'Ask Oloo questions, get platform help, or reflect out loud in a chat.' },
  { title: 'Connect', body: 'Join The Circle, try Whispers, or RSVP to events when you feel ready.' },
  { title: 'Review your progress', body: 'Look back at your reflections and the Recovery Report for patterns.' },
  { title: 'Reach real help when needed', body: 'Crisis lines and professional support are always listed — no account required.' },
]

export function HowItWorks() {
  return (
    <section className="ll-section" id="how-it-works" aria-labelledby="ll-steps-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Your pace, your order</p>
        <h2 id="ll-steps-title">How LossLens works</h2>
        <p className="ll-lede">
          There is no fixed programme you must complete. Most members start with
          the Diary, then add tools as they need them. Recovery is not automatic
          or guaranteed — LossLens gives you structure and support to work with.
        </p>
        <ol className="ll-steps ll-steps--timeline">
          {STEPS.map((step, index) => (
            <li className="ll-step" key={step.title}>
              <span className="ll-step__number">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link to="/privacy" className="ll-text-link">Read our privacy information</Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 7 — LossLens Protection                                             */
/* ------------------------------------------------------------------ */
const PROTECTION_ROLES = [
  ['Licensed insurer', 'sells the policy, collects premiums, sets the terms and decides claims.'],
  ['Qualified clinicians', 'assess, diagnose and decide what treatment is appropriate.'],
  ['LossLens', 'provides the recovery platform, education, day-to-day tools and — with separate permission — limited status updates. LossLens is not the insurer.'],
]

const PROTECTION_COVERS = [
  'Clinical assessment for gambling disorder',
  'Outpatient therapy, including CBT where appropriate',
  'Psychiatric consultation when clinically needed',
  'Structured outpatient programmes',
  'Inpatient treatment only where clinically necessary and pre-approved',
  'Follow-up after treatment',
  'Family counselling, with the patient\u2019s consent',
]

const PROTECTION_NEVER = [
  'Betting stakes, gambling losses or debts',
  'Loan balances or lost savings',
  'Rent arrears or cash compensation for having gambled',
  'Treatment that is not clinically necessary',
]

const PROTECTION_PRIVACY = [
  'Your diary is never shared with insurers.',
  'Oloo conversations are never shared with insurers.',
  'Crisis data and behavioural risk scores are never shared with insurers.',
  'Any permitted status sharing is limited and separately authorised by you.',
  'Insurance decisions belong to the insurer — never to LossLens.',
]

export function ProtectionSection() {
  return (
    <section className="ll-section ll-section--protection" id="protection" aria-labelledby="ll-protection-title">
      <div className="ll-container">
        <p className="ll-eyebrow">LossLens Protection · concept stage</p>
        <h2 id="ll-protection-title">A proposed treatment benefit — not insurance you can buy today</h2>
        <p className="ll-lede">
          LossLens Protection is a concept for a treatment benefit that could one
          day be added to an existing medical insurance product. It is not cash
          compensation for gambling losses, it is not for sale, and it is not an
          offer of cover.
        </p>
        <div className="ll-protection__grid">
          <div className="ll-protection__card">
            <h3>Who would do what</h3>
            <ul>
              {PROTECTION_ROLES.map(([name, body]) => (
                <li key={name}><strong>{name}:</strong> {body}</li>
              ))}
            </ul>
          </div>
          <div className="ll-protection__card">
            <h3>What it could cover <small>proposed, subject to insurer and regulator</small></h3>
            <ul className="ll-protection__covers">
              {PROTECTION_COVERS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="ll-protection__card">
            <h3>What it would never cover</h3>
            <ul className="ll-protection__never">
              {PROTECTION_NEVER.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <div className="ll-protection__privacy">
          <h3>Your privacy boundary</h3>
          <ul>
            {PROTECTION_PRIVACY.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>
            A LossLens quiz, risk score or Oloo conversation never creates a
            clinical diagnosis or determines insurance eligibility. Platform
            subscriptions and any future insurance premiums are completely
            separate things.
          </p>
          <Link to="/protection" className="ll-btn ll-btn--ghost">Read the full Protection concept</Link>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 8 — Subscriptions                                                   */
/* ------------------------------------------------------------------ */
export function PricingSection() {
  const plans = [
    { code: PLANS.FREE, name: PLAN_META[PLANS.FREE].name, body: 'The core recovery tools — diary, toolkit, CBT modules, Oloo and community — free to start.' },
    { code: PLANS.PREMIUM, name: PLAN_META[PLANS.PREMIUM].name, body: 'Additional features and extended usage where entitlements are configured. Price is set by the payment configuration — see the pricing page.' },
    { code: PLANS.COMPANY, name: PLAN_META[PLANS.COMPANY].name, body: 'An employer-sponsored or subsidised option using a company code. Contact the team for details and pricing.' },
  ]
  return (
    <section className="ll-section ll-section--tint" id="pricing" aria-labelledby="ll-pricing-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Subscriptions</p>
        <h2 id="ll-pricing-title">Start free, upgrade if it helps</h2>
        <p className="ll-lede">
          A LossLens subscription pays for the platform — it is completely
          separate from LossLens Protection or any insurance premium.
        </p>
        <div className="ll-pricing">
          {plans.map((plan) => (
            <article className="ll-pricing__card" key={plan.code}>
              <h3>{plan.name}</h3>
              <p>{plan.body}</p>
            </article>
          ))}
        </div>
        <Link to="/pricing" className="ll-btn ll-btn--primary">See full pricing</Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 9 — Privacy, trust and responsible use                              */
/* ------------------------------------------------------------------ */
const TRUST = [
  'Your diary, chats and personal reflections are private to your account.',
  'Oloo only uses your chat data with your consent, and its consent gate is enforced on the server.',
  'You control what the Family Portal shares — selected updates only.',
  'App-generated scores and reports are screening information, not medical diagnoses.',
  'Support tickets are for product help — they are not an emergency channel.',
]

export function PrivacyTrust() {
  return (
    <section className="ll-section" aria-labelledby="ll-trust-title">
      <div className="ll-container ll-trust__grid">
        <div>
          <p className="ll-eyebrow">Privacy and trust</p>
          <h2 id="ll-trust-title">Built for a sensitive subject</h2>
          <p>
            Gambling recovery involves things people rarely say out loud. LossLens
            is designed so reflection stays yours: private by default, consent-led
            where data is used, and honest about what the platform can and cannot
            do. Our Privacy and Terms pages are drafts pending legal review.
          </p>
        </div>
        <ul className="ll-trust__list">
          {TRUST.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 10 — Founder / About                                                 */
/* ------------------------------------------------------------------ */
export function Founder() {
  return (
    <section className="ll-section ll-section--tint" aria-labelledby="ll-founder-title">
      <div className="ll-container ll-about__grid">
        <div className="ll-about__intro">
          <p className="ll-eyebrow">About LossLens</p>
          <h2 id="ll-founder-title">Built in Kenya, for Kenyans</h2>
        </div>
        <div className="ll-about__body">
          <p>
            LossLens is a free, private recovery companion for people affected by
            betting in Kenya. It brings a daily diary, coping tools, structured
            learning, an AI companion and peer support into one place, so you can
            notice patterns and take one small step at a time.
          </p>
          <p>
            LossLens is founded by Vicky Precious Bariu. The platform is in active
            development — core tools are available now, and the Protection
            programme described above is still a concept.
          </p>
          {SITE.founderNote && <p className="ll-founder-note">{SITE.founderNote}</p>}
          <Link to="/about" className="ll-text-link">More about LossLens</Link>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 11 — Crisis support                                                 */
/* ------------------------------------------------------------------ */
export function CrisisStrip() {
  return (
    <section className="ll-crisis" id="crisis-help" aria-labelledby="ll-crisis-title">
      <div className="ll-container">
        <p className="ll-eyebrow">Support is available</p>
        <h2 id="ll-crisis-title">Need help right now?</h2>
        <p className="ll-lede">
          These helplines are free to call and do not need a LossLens account.
          The LossLens support inbox is for product questions — it is not an
          emergency response channel.
        </p>
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

/* ------------------------------------------------------------------ */
/* 12 — FAQ                                                            */
/* ------------------------------------------------------------------ */
const FAQS = [
  {
    q: 'What is LossLens?',
    a: 'A private gambling-recovery companion for people in Kenya. It combines a daily diary, CBT modules, an urge toolkit, an AI companion called Oloo, peer support and community events in one place.',
  },
  {
    q: 'Who is LossLens for?',
    a: 'Anyone in Kenya who wants to reduce or stop harmful betting — whether or not they have gambled recently, and whether or not they have insurance.',
  },
  {
    q: 'Is LossLens free?',
    a: 'The Free plan covers the core recovery tools. Premium adds features where entitlements are configured, and Company plans are employer-sponsored. See the pricing page for current details.',
  },
  {
    q: 'What does Premium add?',
    a: 'Additional features and extended usage where those entitlements are configured for your account. Premium is a platform subscription paid via M-Pesa — it is unrelated to insurance.',
  },
  {
    q: 'What is Oloo?',
    a: 'LossLens\u2019s AI companion. It can reflect with you, explain the platform, and — after your confirmation — help with supported actions like logging a diary entry or registering for an event.',
  },
  {
    q: 'Can Oloo save a diary entry or register me for an event?',
    a: 'Yes — but only after it shows you the details and you confirm. Nothing consequential happens without your say-so, and the system confirms the result.',
  },
  {
    q: 'Is LossLens Protection already available?',
    a: 'No. It is a concept-stage programme — not for sale, not an offer of cover, and not a promise that it will launch. The full explanation is on the Protection page.',
  },
  {
    q: 'Is LossLens an insurance company?',
    a: 'No. LossLens is a recovery platform. Any future Protection benefit would be sold and decided by a licensed insurer; LossLens would only provide the app and, with permission, limited status updates.',
  },
  {
    q: 'Does LossLens share my diary with an insurer?',
    a: 'No. Your diary, Oloo chats, crisis data and risk scores are never shared with insurers. Only minimal status information could ever be shared, and only with your separate permission.',
  },
  {
    q: 'Can I use LossLens without insurance?',
    a: 'Yes. The core platform is free and open to everyone. Protection, if it ever launches, would be an optional add-on through a licensed insurer.',
  },
  {
    q: 'How do I contact the team?',
    a: 'Use the Talk to the team button on this page for email or phone, or — once signed in — the Support page to raise and track a ticket.',
  },
  {
    q: 'What should I do if I need urgent help?',
    a: 'Call a crisis helpline — Befrienders Kenya or NACADA — listed in the crisis section. They are available without an account and around the clock.',
  },
]

export function Faq() {
  const [open, setOpen] = useState(null)
  return (
    <section className="ll-section ll-section--tint" id="faq" aria-labelledby="ll-faq-title">
      <div className="ll-container ll-faq__wrap">
        <p className="ll-eyebrow">Questions</p>
        <h2 id="ll-faq-title">Frequently asked questions</h2>
        <div className="ll-faq">
          {FAQS.map((item, index) => (
            <div className="ll-faq__item" key={item.q}>
              <button
                type="button"
                className="ll-faq__q"
                aria-expanded={open === index}
                aria-controls={`ll-faq-a-${index}`}
                onClick={() => setOpen(open === index ? null : index)}
              >
                {item.q}
                <span className="ll-faq__chevron" aria-hidden="true">{open === index ? '−' : '+'}</span>
              </button>
              {open === index && (
                <p className="ll-faq__a" id={`ll-faq-a-${index}`}>{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Closing CTA                                                         */
/* ------------------------------------------------------------------ */
export function ClosingCTA() {
  return (
    <section className="ll-section ll-cta" aria-labelledby="ll-cta-title">
      <div className="ll-container ll-cta__inner">
        <div>
          <p className="ll-eyebrow">Start when you are ready</p>
          <h2 id="ll-cta-title">Start free today</h2>
          <p className="ll-lede">
            Create a private account and begin with a check-in. You can explore
            at your own pace — no payment, no insurance, no pressure.
          </p>
        </div>
        <div className="ll-cta__actions">
          <Link to="/signup" className="ll-btn ll-btn--primary">Get started</Link>
          <a className="ll-btn ll-btn--ghost" href={mailtoHref('Hello LossLens')}>Talk to the team</a>
        </div>
      </div>
    </section>
  )
}
