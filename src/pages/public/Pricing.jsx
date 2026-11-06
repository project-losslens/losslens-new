import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../styles/globals.css'

const FAQS = [
  { q: 'Is LossLens really free?', a: 'Yes — forever. The Free plan includes all core features: diary, CBT modules, AI companion Oloo, The Circle community, and more. No credit card needed.' },
  { q: 'What does Premium add?', a: 'Premium unlocks advanced features like detailed analytics, priority AI responses, extended video storage, and more. You also directly support keeping LossLens free for everyone.' },
  { q: 'Can I switch plans?', a: 'Absolutely. Upgrade or downgrade anytime. If you downgrade, you keep access to Premium features until the end of your billing period.' },
  { q: 'How do I pay?', a: 'Premium subscriptions are processed securely via M-Pesa. We never store your payment details — all transactions are handled by our payment partner.' },
  { q: 'Is my data private?', a: 'Completely. Your diary, mood logs, and conversations are encrypted. You can delete everything anytime with one click. We never sell your data.' },
  { q: 'What is the Company plan?', a: 'For organizations that want to offer LossLens to their employees. Includes subsidized pricing, admin dashboard for the company, usage reports, and dedicated support. Ask your employer if they offer LossLens.' },
]

export default function Pricing() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)
  const [expandedFaq, setExpandedFaq] = useState(null)
  const [planType, setPlanType] = useState('individual') // 'individual' or 'company'
  const loadingTimer = useRef(null)

  useEffect(() => { return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current) } }, [])

  const handleSelect = (plan, type) => {
    setLoading(plan)
    loadingTimer.current = setTimeout(() => {
      setLoading(null)
      if (plan === 'clinic') {
        window.location.href = 'mailto:projectkingsly@gmail.com?subject=Company Plan Inquiry'
      } else {
        navigate(`/signup?plan=${plan}&type=${type}`)
      }
    }, 800)
  }

  const individualPlans = [
    {
      id: 'free',
      name: 'Free',
      badge: 'For individuals',
      price: 'KES 0',
      period: 'forever',
      desc: 'Full access to all core recovery tools — no catch, no credit card.',
      features: [
        ' Daily Gambling Diary',
        ' 8 CBT Modules',
        ' AI Companion Oloo',
        ' The Circle community',
        ' Whispers peer matching',
        ' Events & RSVPs',
        ' Resource Directory',
        ' Family Portal (1 supporter)',
        ' Monthly Mirror (3 videos)',
        ' LossLens Pact (3 recordings)',
        ' Recovery Report',
        ' Urge Toolkit',
      ],
      cta: 'Get started free',
      featured: false,
    },
    {
      id: 'premium',
      name: 'Premium',
      badge: 'Most Popular',
      price: 'KES 499',
      period: '/month',
      desc: 'Advanced features for committed recovery — and you support keeping LossLens free for everyone.',
      features: [
        ' Everything in Free',
        ' Advanced Analytics & Insights',
        ' Priority AI Responses',
        ' Unlimited Monthly Mirror videos',
        ' Unlimited LossLens Pact recordings',
        ' Up to 5 supporters',
        ' Detailed Progress Reports',
        ' Custom Reminders & Alerts',
        ' Personalized Goal Tracking',
      ],
      cta: 'Start 7-day free trial',
      featured: true,
    },
  ]

  const companyPlan = {
    id: 'company',
    name: 'Company Plan',
    badge: 'Subsidized',
    price: 'KES 199',
    period: '/employee/month',
    desc: 'Your employer covers part of the cost. You get Premium features at a fraction of the price.',
    features: [
      ' Everything in Premium',
      ' Paid by your employer',
      ' Save 60% vs individual Premium',
      ' Company admin dashboard',
      ' Anonymous usage reports',
      ' Team progress insights',
      ' Priority support',
      ' Your data stays private from employer',
    ],
    cta: 'Join with company code',
    featured: true,
  }

  return (
    <div className="root">
      {/* Nav */}
      <nav className="navbar">
        <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate('/')}>LossLens</span>
        <div className="nav-links" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="nav-ghost" onClick={() => navigate('/login')}>Log in</button>
          <button className="nav-btn" onClick={() => navigate('/signup')}>Sign up free</button>
        </div>
      </nav>

      {/* Hero */}
      <main>
        <div className="pricing-hero" style={{ padding: '3rem 2rem 1.5rem', textAlign: 'center' }}>
          <div className="pill">Pricing</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: '0.75rem' }}>
            {planType === 'individual' ? (
              <>Free for individuals.<br /><em style={{ color: '#2DD4BF' }}>Premium when you're ready.</em></>
            ) : (
              <>Subsidized by your employer.<br /><em style={{ color: '#2DD4BF' }}>Premium features, lower cost.</em></>
            )}
          </h1>
          <p className="sub" style={{ maxWidth: '520px', margin: '0 auto 1.5rem' }}>
            {planType === 'individual'
              ? 'Every feature you need to recover is free. Premium helps you go deeper — and supports keeping LossLens accessible to everyone in Kenya.'
              : 'If your company offers LossLens, you get all Premium features at a subsidized rate. Your personal data stays private.'}
          </p>

          {/* Plan Type Toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: '100px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: '0.5rem' }}>
            <button
              onClick={() => setPlanType('individual')}
              style={{
                padding: '10px 24px', borderRadius: '100px', border: 'none',
                background: planType === 'individual' ? '#2DD4BF' : 'transparent',
                color: planType === 'individual' ? '#0B1220' : 'rgba(255,255,255,0.4)',
                fontSize: '13px', fontWeight: planType === 'individual' ? 600 : 400,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s'
              }}>
               Individual
            </button>
            <button
              onClick={() => setPlanType('company')}
              style={{
                padding: '10px 24px', borderRadius: '100px', border: 'none',
                background: planType === 'company' ? '#2DD4BF' : 'transparent',
                color: planType === 'company' ? '#0B1220' : 'rgba(255,255,255,0.4)',
                fontSize: '13px', fontWeight: planType === 'company' ? 600 : 400,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s'
              }}>
               Company
            </button>
          </div>
        </div>

        {/* Individual Plans */}
        {planType === 'individual' && (
          <section className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', padding: '0 2rem 2rem', maxWidth: '700px', margin: '0 auto' }} aria-label="Individual pricing plans">
            {individualPlans.map(plan => (
              <article
                key={plan.id}
                className={`pricing-card ${plan.featured ? 'featured' : ''}`}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: plan.featured ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '16px',
                  padding: '2rem',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.featured && (
                  <span className="popular-tag" style={{
                    position: 'absolute', top: '-12px', right: '20px',
                    background: '#2DD4BF', color: '#0B1220', fontSize: '11px',
                    fontWeight: 600, padding: '4px 12px', borderRadius: '100px',
                  }}>
                    {plan.badge}
                  </span>
                )}

                <div className="plan-badge" style={{
                  display: 'inline-block', fontSize: '11px', fontWeight: 500,
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '4px 12px', borderRadius: '100px', marginBottom: '1rem',
                  background: plan.featured ? '#2DD4BF' : 'rgba(255,255,255,0.12)',
                  color: plan.featured ? '#0B1220' : '#2DD4BF',
                }}>
                  {plan.id === 'free' ? 'Free' : 'Premium'}
                </div>

                <div className="plan-price" style={{ marginBottom: '0.5rem' }}>
                  <span className="price-num" style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', color: '#FFFFFF' }}>{plan.price}</span>
                  <span className="price-period" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>{plan.period}</span>
                </div>

                <p className="plan-desc" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5', marginBottom: '1.5rem', fontWeight: 300 }}>{plan.desc}</p>

                <ul className="plan-features" style={{ listStyle: 'none', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{ fontSize: '13px', color: '#7DBDEE', fontWeight: 300 }}>{f}</li>
                  ))}
                </ul>

                <button
                  className="btn-primary full"
                  onClick={() => handleSelect(plan.id, 'individual')}
                  disabled={loading === plan.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', fontSize: '14px' }}
                  aria-label={`${plan.cta} — ${plan.name} plan`}
                >
                  {loading === plan.id ? <span className="spinner"></span> : plan.cta}
                </button>
              </article>
            ))}
          </section>
        )}

        {/* Company Plan */}
        {planType === 'company' && (
          <section style={{ padding: '0 2rem 2rem', maxWidth: '450px', margin: '0 auto' }} aria-label="Company plan">
            <article
              className="pricing-card featured"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '2px solid #2DD4BF',
                borderRadius: '16px',
                padding: '2rem',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span className="popular-tag" style={{
                position: 'absolute', top: '-12px', right: '20px',
                background: '#2DD4BF', color: '#0B1220', fontSize: '11px',
                fontWeight: 600, padding: '4px 12px', borderRadius: '100px',
              }}>
                {companyPlan.badge}
              </span>

              <div className="plan-badge" style={{
                display: 'inline-block', fontSize: '11px', fontWeight: 500,
                letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '4px 12px', borderRadius: '100px', marginBottom: '1rem',
                background: '#2DD4BF', color: '#0B1220',
              }}>
                Company
              </div>

              <div className="plan-price" style={{ marginBottom: '0.5rem' }}>
                <span className="price-num" style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', color: '#FFFFFF' }}>{companyPlan.price}</span>
                <span className="price-period" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>{companyPlan.period}</span>
              </div>

              <p className="plan-desc" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5', marginBottom: '1.5rem', fontWeight: 300 }}>{companyPlan.desc}</p>

              <ul className="plan-features" style={{ listStyle: 'none', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {companyPlan.features.map((f, i) => (
                  <li key={i} style={{ fontSize: '13px', color: '#7DBDEE', fontWeight: 300 }}>{f}</li>
                ))}
              </ul>

              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', border: '1px solid rgba(45,212,191,0.2)' }}>
                <p style={{ color: '#2DD4BF', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
                   <strong style={{ color: '#2DD4BF' }}>How it works:</strong> Your employer gives you a company code. Enter it during signup to unlock the subsidized rate.
                </p>
              </div>

              <button
                className="btn-primary full"
                onClick={() => handleSelect('company', 'company')}
                disabled={loading === 'company'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', fontSize: '14px' }}
                aria-label="Join with company code"
              >
                {loading === 'company' ? <span className="spinner"></span> : companyPlan.cta}
              </button>
            </article>

            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '1rem' }}>
              Don't have a company code? <span onClick={() => setPlanType('individual')} style={{ color: '#2DD4BF', cursor: 'pointer', textDecoration: 'underline' }}>View individual plans</span>
            </p>
          </section>
        )}

        {/* FAQ Section */}
        <section style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }} aria-label="Frequently asked questions">
          <h2 style={{ textAlign: 'center', color: '#2DD4BF', fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', marginBottom: '1.5rem' }}>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  style={{ width: '100%', padding: '16px', background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '14px', fontWeight: 500, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Inter', sans-serif", textAlign: 'left' }}
                  aria-expanded={expandedFaq === i}
                >
                  {faq.q}
                  <span style={{ color: '#2DD4BF', fontSize: '18px', transition: 'transform 0.2s', transform: expandedFaq === i ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                </button>
                {expandedFaq === i && (
                  <div style={{ padding: '0 16px 16px', color: '#2DD4BF', fontSize: '13px', lineHeight: '1.7', fontWeight: 300 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Trust Bar */}
        <section style={{ padding: '2rem', textAlign: 'center' }} aria-label="Trust indicators">
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Built with trust & transparency</p>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: '', label: 'End-to-end encrypted' },
              { icon: '🇰🇪', label: 'Kenya-based & compliant' },
              { icon: 'ï ¸ ', label: 'Delete data anytime' },
              { icon: '', label: 'Free forever for individuals' },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2DD4BF', fontSize: '12px' }}>
                <span aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer" style={{ flexDirection: 'column', gap: '12px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', padding: '1.5rem 2rem' }}>
        <div>
          <p>LossLens  · Gambling Harm Reduction  · Kenya  · 2026</p>
          <p style={{ fontSize: '11px', marginTop: '4px' }}>
            <a href="mailto:projectkingsly@gmail.com" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>projectkingsly@gmail.com</a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a onClick={() => navigate('/privacy')} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Privacy Policy</a>
          <a onClick={() => navigate('/terms')} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Terms of Service</a>
          <a href="mailto:projectkingsly@gmail.com" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', textDecoration: 'none' }}>Contact</a>
        </div>
        <p>Crisis? Call NACADA <strong style={{ color: '#2DD4BF' }}>1192</strong> (24/7 free)</p>
      </footer>
    </div>
  )
}
