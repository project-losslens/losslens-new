import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'

const PLANS = {
  FREE: 'free',
  PREMIUM: 'premium',
}

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)
  const [profile, setProfile] = useState(null)
  const [companyInfo, setCompanyInfo] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [interestRegistered, setInterestRegistered] = useState(false)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [showJoinCompany, setShowJoinCompany] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPageLoading(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('subscription_plan, subscription_status, plan_type, b2b_client_id')
        .eq('id', session.user.id)
        .single()

      if (data) {
        setProfile(data)

        // If user belongs to a company, fetch company info
        if (data.b2b_client_id) {
          const { data: client } = await supabase
            .from('b2b_clients')
            .select('company_name, plan, company_code')
            .eq('id', data.b2b_client_id)
            .single()
          if (client) setCompanyInfo(client)
        }
      }
    } catch (err) { console.error('Profile fetch error:', err) }
    finally { setPageLoading(false) }
  }

  const handleUpgrade = async (plan) => {
    const currentPlan = profile?.subscription_plan || PLANS.FREE

    // If already on company plan, show info
    if (profile?.plan_type === 'company') {
      showToast('You\'re on a company-subsidized plan! All Premium features are included.')
      return
    }

    if (plan === currentPlan) {
      showToast(`You're already on the ${plan === PLANS.FREE ? 'Free' : 'Premium'} plan!`, 2000)
      return
    }

    setLoading(plan)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await supabase.from('upgrade_interest').insert({
          user_id: session.user.id,
          plan,
          created_at: new Date().toISOString(),
        }).select().single()
      }
    } catch (err) { /* Silent — analytics only */ }

    setLoading(null)
    setShowComingSoon(true)
  }

  const handleJoinCompany = async () => {
    if (!companyCode.trim()) {
      setJoinError('Enter a company code')
      return
    }
    setJoinLoading(true)
    setJoinError('')

    try {
      // Validate code
      const { data: client, error: codeError } = await supabase
        .from('b2b_clients')
        .select('id, company_name, seats, status')
        .eq('company_code', companyCode.toUpperCase().trim())
        .eq('status', 'active')
        .maybeSingle()

      if (codeError) throw codeError
      if (!client) {
        setJoinError('Invalid company code')
        setJoinLoading(false)
        return
      }

      // Check seats
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('b2b_client_id', client.id)

      if (client.seats && count >= client.seats) {
        setJoinError('All seats are currently full')
        setJoinLoading(false)
        return
      }

      // Update profile
      const { data: { session } } = await supabase.auth.getSession()
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          b2b_client_id: client.id,
          plan_type: 'company',
        })
        .eq('id', session.user.id)

      if (updateError) throw updateError

      setProfile(prev => ({ ...prev, b2b_client_id: client.id, plan_type: 'company' }))
      setCompanyInfo({ company_name: client.company_name, plan: client.plan, company_code: companyCode.toUpperCase().trim() })
      setShowJoinCompany(false)
      setCompanyCode('')
      showToast(` Joined ${client.company_name}! You now have company-subsidized access.`)
    } catch (err) {
      setJoinError('Failed to join. Try again.')
    }
    setJoinLoading(false)
  }

  const handleCloseComingSoon = () => {
    setShowComingSoon(false)
    setInterestRegistered(true)
  }

  const isCompanyPlan = profile?.plan_type === 'company'
  const currentPlan = isCompanyPlan ? 'company' : (profile?.subscription_plan === PLANS.PREMIUM ? PLANS.PREMIUM : PLANS.FREE)

  if (pageLoading) {
    return (
      <div className="root" style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.12)', borderTopColor: '#2DD4BF', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}></div>
      </div>
    )
  }

  return (
    <div className="root">
      <nav className="navbar">
        <span className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>LossLens</span>
        <button className="nav-ghost" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">Ã¢"   Dashboard</button>
      </nav>

      <div className="dashboard" style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="pill" style={{ marginBottom: '1rem' }}>
            {isCompanyPlan ? 'Company Plan' : currentPlan === PLANS.FREE ? 'Free Plan' : 'Premium Member'}
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.8rem', color: '#FFFFFF', marginBottom: '0.5rem' }}>
            {isCompanyPlan
              ? 'Company-Subsidized Access'
              : currentPlan === PLANS.FREE
                ? 'Upgrade to Premium'
                : 'Your Premium Benefits'}
          </h2>
          <p style={{ color: '#2DD4BF', fontSize: '14px', fontWeight: 300 }}>
            {isCompanyPlan
              ? `You're covered by ${companyInfo?.company_name || 'your employer'}. All Premium features are included.`
              : currentPlan === PLANS.FREE
                ? 'Unlock advanced features and support keeping LossLens free for everyone.'
                : 'Thank you for supporting LossLens! Here\'s what you have access to.'}
          </p>
        </div>

        {/* Company Plan Banner */}
        {isCompanyPlan && companyInfo && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(255,255,255,0.12))',
            border: '2px solid #2DD4BF',
            borderRadius: '14px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}></span>
            <h3 style={{ color: '#2DD4BF', fontSize: '16px', margin: '0 0 4px' }}>{companyInfo.company_name}</h3>
            <p style={{ color: '#2DD4BF', fontSize: '12px', margin: 0 }}>
              {companyInfo.plan?.charAt(0).toUpperCase() + companyInfo.plan?.slice(1)} Plan  · Subsidized Access
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '8px' }}>
               Your employer covers most of the cost. You get all Premium features while your personal data stays private.
            </p>
          </div>
        )}

        {/* Plan Comparison — only show for non-company users */}
        {!isCompanyPlan && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '2rem' }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)', border: `2px solid ${currentPlan === PLANS.FREE ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '14px', padding: '1.5rem', textAlign: 'center',
              opacity: currentPlan === PLANS.PREMIUM ? 0.6 : 1,
            }}>
              <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}></span>
              <h3 style={{ color: '#FFFFFF', fontSize: '15px', marginBottom: '4px' }}>Free</h3>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: '#2DD4BF', margin: '0 0 4px' }}>KES 0</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Forever</p>
              {currentPlan === PLANS.FREE && (
                <span style={{ display: 'inline-block', marginTop: '8px', background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '3px 10px', borderRadius: '100px', fontSize: '10px', border: '1px solid #2DD4BF' }}>Current Plan</span>
              )}
            </div>

            <div style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)',
              border: `2px solid ${currentPlan === PLANS.PREMIUM ? '#2DD4BF' : 'rgba(45,212,191,0.2)'}`,
              borderRadius: '14px', padding: '1.5rem', textAlign: 'center',
              position: 'relative',
            }}>
              <span style={{ position: 'absolute', top: '-10px', right: '16px', background: '#2DD4BF', color: '#0B1220', fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '100px' }}>Premium</span>
              <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}></span>
              <h3 style={{ color: '#FFFFFF', fontSize: '15px', marginBottom: '4px' }}>Premium</h3>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: '#2DD4BF', margin: '0 0 4px' }}>KES 499</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>/month</p>
              {currentPlan === PLANS.PREMIUM && (
                <span style={{ display: 'inline-block', marginTop: '8px', background: '#2DD4BF', color: '#0B1220', padding: '3px 10px', borderRadius: '100px', fontSize: '10px', fontWeight: 600 }}>Current Plan</span>
              )}
            </div>
          </div>
        )}

        {/* Premium Features */}
        <div className="dash-section" style={{ marginBottom: '1.5rem', borderColor: '#2DD4BF' }}>
          <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}>
            {isCompanyPlan ? ' Your Company Plan Includes:' : ' Premium Includes Everything in Free, Plus:'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { emoji: '', text: 'Advanced Analytics & Insights' },
              { emoji: '', text: 'Priority AI Responses from Oloo' },
              { emoji: '', text: 'Unlimited Monthly Mirror Videos' },
              { emoji: '', text: 'Unlimited LossLens Pact Recordings' },
              { emoji: '', text: 'Up to 5 Family Supporters' },
              { emoji: '', text: 'Detailed Progress Reports' },
              { emoji: '', text: 'Custom Reminders & Alerts' },
              { emoji: '', text: 'Personalized Goal Tracking' },
              ...(isCompanyPlan ? [
                { emoji: '', text: 'Subsidized by your employer' },
                { emoji: '', text: 'Your data stays private from employer' },
              ] : []),
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#7DBDEE', fontSize: '13px' }}>
                <span style={{ fontSize: '16px' }}>{f.emoji}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Join Company Section — only for individual users */}
        {!isCompanyPlan && (
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}></span>
            <h4 style={{ color: '#FFFFFF', fontSize: '14px', margin: '0 0 6px' }}>Have a company code?</h4>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 12px' }}>
              If your employer offers LossLens, enter your code for subsidized Premium access.
            </p>
            {!showJoinCompany ? (
              <button onClick={() => setShowJoinCompany(true)} style={{
                padding: '10px 20px', borderRadius: '100px', background: 'transparent',
                border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '13px',
                cursor: 'pointer', fontFamily: "'Inter', sans-serif"
              }}>
                Enter Company Code
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="e.g. AARXYZ"
                    value={companyCode}
                    onChange={e => { setCompanyCode(e.target.value.toUpperCase()); setJoinError('') }}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '8px',
                      background: '#0B1220', border: `1px solid ${joinError ? '#FFFFFF' : 'rgba(255,255,255,0.12)'}`,
                      color: '#FFFFFF', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none'
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleJoinCompany()}
                  />
                  <button
                    onClick={handleJoinCompany}
                    disabled={joinLoading}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', background: '#2DD4BF',
                      border: 'none', color: '#0B1220', fontSize: '13px', fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'Inter', sans-serif"
                    }}
                  >
                    {joinLoading ? '...' : 'Join'}
                  </button>
                </div>
                {joinError && <p style={{ color: '#FFFFFF', fontSize: '11px', margin: 0 }}>{joinError}</p>}
                <button onClick={() => { setShowJoinCompany(false); setJoinError(''); setCompanyCode('') }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '11px', cursor: 'pointer', marginTop: '4px' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Button — only for free individual users */}
        {!isCompanyPlan && currentPlan === PLANS.FREE && !interestRegistered && (
          <button
            className="btn-primary full"
            onClick={() => handleUpgrade(PLANS.PREMIUM)}
            disabled={loading === PLANS.PREMIUM}
            style={{ padding: '14px', fontSize: '15px', marginBottom: '1rem' }}
          >
            {loading === PLANS.PREMIUM ? <span className="spinner"></span> : ' Upgrade to Premium'}
          </button>
        )}

        {interestRegistered && (
          <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.12)', borderRadius: '12px', border: '1px solid #2DD4BF', marginBottom: '1rem' }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}></span>
            <p style={{ color: '#2DD4BF', fontSize: '14px', fontWeight: 500, margin: 0 }}>Thanks for your interest!</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '4px' }}>We'll notify you when Premium launches.</p>
          </div>
        )}

        {/* FAQ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#FFFFFF', fontSize: '14px', marginBottom: '4px' }}> FAQ</h3>
          {[
            { q: 'Can I switch back to Free?', a: 'Yes, anytime. You keep Premium access until the end of your billing period.' },
            { q: 'How do I pay?', a: 'Premium will use M-Pesa — Kenya\'s most trusted mobile payment. No credit card needed.' },
            { q: 'Is my data still private?', a: 'Absolutely. Premium doesn\'t change our privacy commitment. Your data is yours.' },
            ...(isCompanyPlan ? [{ q: 'Can my employer see my diary?', a: 'No. Your diary, messages, and personal data are completely private. Your employer only sees anonymized usage statistics — never your personal content.' }] : []),
            { q: 'What if my company stops offering LossLens?', a: 'Your account stays active. You can switch to an individual Free or Premium plan anytime.' },
          ].map((faq, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px 14px' }}>
              <p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 500, margin: '0 0 4px' }}>{faq.q}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>{faq.a}</p>
            </div>
          ))}
        </div>

        <p style={{ color: '#7DBDEE', fontSize: '11px', textAlign: 'center' }}>
           LossLens Premium launches soon. All features are free during testing.
        </p>
      </div>

      {/* Coming Soon Modal */}
      {showComingSoon && (
        <div onClick={handleCloseComingSoon} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '2px solid #2DD4BF', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#2DD4BF', fontSize: '18px', fontFamily: "'Playfair Display', serif", marginBottom: '12px' }}>Premium Coming Soon!</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              M-Pesa payments are being set up. During testing, <strong style={{ color: '#2DD4BF' }}>all features are free</strong>.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '16px' }}>
              We've noted your interest — you'll be the first to know when Premium launches!
            </p>
            <button onClick={handleCloseComingSoon} className="btn-primary full" style={{ padding: '12px', fontSize: '14px' }}>
              Got it — keep exploring!
            </button>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button onClick={() => navigate('/dashboard')} className="bottom-nav-item"><span></span><span>Home</span></button>
        <button onClick={() => navigate('/diary')} className="bottom-nav-item"><span></span><span>Diary</span></button>
        <button onClick={() => navigate('/cbt')} className="bottom-nav-item"><span></span><span>Learn</span></button>
        <button onClick={() => navigate('/urge-toolkit')} className="bottom-nav-item"><span></span><span>Toolkit</span></button>
        <button onClick={() => navigate('/profile')} className="bottom-nav-item"><span></span><span>Profile</span></button>
      </nav>
    </div>
  )
}
