import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'

//  Constants
const GOAL_MAP = {
  cut_down: 'Cut down',
  abstinence: 'Abstinence',
  maintain: 'Stay on track',
  exploring: 'Just exploring',
}

const QUESTIONS = [
  {
    id: 'frequency',
    title: 'How often do you gamble?',
    subtitle: 'Be honest — this helps us personalize your experience',
    options: [
      { value: 'daily', label: 'Daily', emoji: '', desc: 'Most days of the week' },
      { value: 'weekly', label: 'Weekly', emoji: '', desc: 'A few times per week' },
      { value: 'monthly', label: 'Monthly', emoji: '', desc: 'A few times per month' },
      { value: 'rarely', label: 'Rarely', emoji: '⏰', desc: 'Once in a while' },
    ]
  },
  {
    id: 'spending',
    title: 'How much do you typically spend?',
    subtitle: 'Per gambling session',
    options: [
      { value: 'high', label: 'KES 5,000+', emoji: '', desc: 'Significant amounts' },
      { value: 'medium', label: 'KES 500-5,000', emoji: '', desc: 'Moderate amounts' },
      { value: 'low', label: 'Under KES 500', emoji: '', desc: 'Small amounts' },
      { value: 'varies', label: 'It varies a lot', emoji: '', desc: 'Depends on the day' },
    ]
  },
  {
    id: 'impact',
    title: 'How has gambling affected your life?',
    subtitle: 'Select all that apply',
    multi: true,
    options: [
      { value: 'financial', label: 'Financial stress', emoji: '' },
      { value: 'relationships', label: 'Relationship problems', emoji: '' },
      { value: 'mental', label: 'Mental health (anxiety, guilt)', emoji: '' },
      { value: 'work', label: 'Work or study performance', emoji: '' },
      { value: 'minimal', label: 'Minimal impact so far', emoji: '' },
    ]
  },
  {
    id: 'triggers',
    title: 'What usually triggers you to gamble?',
    subtitle: 'Select all that apply',
    multi: true,
    options: [
      { value: 'stress', label: 'Stress or anxiety', emoji: '' },
      { value: 'boredom', label: 'Boredom', emoji: '' },
      { value: 'sports', label: 'Sports matches', emoji: '' },
      { value: 'money', label: 'Financial pressure / Payday', emoji: '' },
      { value: 'social', label: 'Friends or peer pressure', emoji: '' },
      { value: 'ads', label: 'Ads and promotions', emoji: '' },
    ]
  },
  {
    id: 'goal',
    title: 'What brings you to LossLens today?',
    subtitle: 'Choose your primary goal',
    options: [
      { value: 'cut_down', label: 'Cut down', emoji: '', desc: 'Gamble less than I do now' },
      { value: 'abstinence', label: 'Stop completely', emoji: '', desc: 'Quit gambling entirely' },
      { value: 'maintain', label: 'Stay on track', emoji: '', desc: "I've already cut down, want to maintain" },
      { value: 'exploring', label: 'Just exploring', emoji: '', desc: 'Learning about my options' },
    ]
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(() => {
    const saved = sessionStorage.getItem('onboarding_step')
    return saved ? parseInt(saved) : 0
  })
  const [answers, setAnswers] = useState(() => {
    try {
      const saved = sessionStorage.getItem('onboarding_answers')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [loading, setLoading] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [validationWarning, setValidationWarning] = useState('')
  const [saveError, setSaveError] = useState('')

  //  Persist progress
  const saveProgress = useCallback((newStep, newAnswers) => {
    sessionStorage.setItem('onboarding_step', newStep.toString())
    sessionStorage.setItem('onboarding_answers', JSON.stringify(newAnswers))
  }, [])

  //  Question lookup map for O(1) access
  const questionMap = useMemo(() => {
    const map = {}
    QUESTIONS.forEach(q => { map[q.id] = q })
    return map
  }, [])

  const triggerAnimate = useCallback(() => {
    setAnimate(false)
    requestAnimationFrame(() => setAnimate(true))
  }, [])

  const nextStep = useCallback(() => {
    if (!canProceed()) {
      setValidationWarning('Please select an option before continuing.')
      return
    }
    if (step >= QUESTIONS.length - 1) return
    triggerAnimate()
    const newStep = step + 1
    setStep(newStep)
    saveProgress(newStep, answers)
  }, [step, answers, triggerAnimate, saveProgress, canProceed])

  const prevStep = useCallback(() => {
    if (step <= 0) return
    triggerAnimate()
    const newStep = step - 1
    setStep(newStep)
    saveProgress(newStep, answers)
  }, [step, answers, triggerAnimate, saveProgress])

  const handleSelect = useCallback((questionId, value) => {
    const question = questionMap[questionId]
    if (!question) return

    let updated
    if (question.multi) {
      const current = answers[questionId] || []
      updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
    } else {
      updated = value
    }
    const newAnswers = { ...answers, [questionId]: updated }
    setAnswers(newAnswers)
    setValidationWarning('')
    saveProgress(step, newAnswers)
  }, [answers, questionMap, step, saveProgress])

  const isSelected = useCallback((questionId, value) => {
    const question = questionMap[questionId]
    if (!question) return false
    if (question.multi) return (answers[questionId] || []).includes(value)
    return answers[questionId] === value
  }, [answers, questionMap])

  const canProceed = useCallback(() => {
    const q = QUESTIONS[step]
    if (!q) return false
    if (q.multi) return (answers[q.id] || []).length > 0
    return !!answers[q.id]
  }, [step, answers])

  //  Memoized scoring
  const { score, risk, recommendations } = useMemo(() => {
    let s = 0
    if (answers.frequency === 'daily') s += 3
    else if (answers.frequency === 'weekly') s += 2
    else if (answers.frequency === 'monthly') s += 1

    if (answers.spending === 'high') s += 3
    else if (answers.spending === 'medium') s += 2
    else if (answers.spending === 'low') s += 1

    const impacts = answers.impact || []
    if (impacts.length >= 3) s += 3
    else if (impacts.length >= 1) s += 2

    let riskLevel, riskColor, riskEmoji, riskLabel
    if (s >= 7) { riskLevel = 'high'; riskColor = '#F09595'; riskEmoji = ''; riskLabel = 'Significant Risk' }
    else if (s >= 4) { riskLevel = 'medium'; riskColor = '#FAC775'; riskEmoji = ''; riskLabel = 'Moderate Risk' }
    else { riskLevel = 'low'; riskColor = '#6ee7b7'; riskEmoji = ''; riskLabel = 'Lower Risk' }

    const recs = []
    if (s >= 7) {
      recs.push({ icon: '', text: 'Start with CBT Module 1: Understanding Your Gambling', action: '/cbt' })
      recs.push({ icon: '', text: 'Log your first diary entry today — awareness is the first step', action: '/diary' })
      recs.push({ icon: '🆘', text: 'Save emergency helplines — reaching out is strength', action: '/resources' })
    } else if (s >= 4) {
      recs.push({ icon: '', text: 'Track your patterns with the daily diary', action: '/diary' })
      recs.push({ icon: '', text: 'Explore the Urge Toolkit for coping strategies', action: '/urge-toolkit' })
      recs.push({ icon: '', text: 'Try CBT Module 1 to understand your triggers', action: '/cbt' })
    } else {
      recs.push({ icon: '', text: 'Start with a daily diary entry to build awareness', action: '/diary' })
      recs.push({ icon: '', text: 'Join The Circle to connect with others on this journey', action: '/circle' })
      recs.push({ icon: '', text: 'Set a small goal — every clean day counts', action: '/dashboard' })
    }

    return {
      score: s,
      risk: { level: riskLevel, color: riskColor, emoji: riskEmoji, label: riskLabel },
      recommendations: recs,
    }
  }, [answers])

  const progress = useMemo(() => ((step + 1) / QUESTIONS.length) * 100, [step])

  const handleFinish = async () => {
    setSaveError('')
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      const { error } = await supabase.from('profiles').update({
        onboarding_completed: true,
        screening_score: score,
        screening_answers: answers,
        risk_level: risk.level,
        goal: GOAL_MAP[answers.goal] || 'Abstinence',
      }).eq('id', session.user.id)

      if (error) {
        console.error('Onboarding save error:', error)
        setSaveError('We could not save your onboarding answers. Please try again.')
        setLoading(false)
        return
      }
      sessionStorage.removeItem('losslens_new_signup')
    }

    //  Clear saved progress on success
    sessionStorage.removeItem('onboarding_step')
    sessionStorage.removeItem('onboarding_answers')

    setLoading(false)
    navigate('/dashboard', { replace: true })
  }

  const handleSkip = async () => {
    setSkipped(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({
        onboarding_completed: true,
        onboarding_skipped: true,
      }).eq('id', session.user.id)
    }
    sessionStorage.removeItem('onboarding_step')
    sessionStorage.removeItem('onboarding_answers')
    navigate('/dashboard', { replace: true })
  }

  const q = QUESTIONS[step]

  //  Results Screen
  if (step >= QUESTIONS.length) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '16px', padding: '2.5rem 2rem', maxWidth: '500px', width: '100%', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
          <h2 style={{ color: '#f59e0b', fontFamily: "'Playfair Display', serif", fontSize: '22px', marginBottom: '8px' }}>Your journey begins</h2>

          <div style={{ background: '#041f13', borderRadius: '12px', padding: '16px', margin: '16px 0', border: `2px solid ${risk.color}` }}>
            <span style={{ fontSize: '32px' }}>{risk.emoji}</span>
            <p style={{ color: risk.color, fontSize: '14px', fontWeight: 600, margin: '8px 0 4px' }}>{risk.label}</p>
            <p style={{ color: '#3b7a5a', fontSize: '12px' }}>Based on your answers, we've personalized your experience.</p>
          </div>

          {validationWarning && (
            <div role="alert" style={{ color: '#F09595', border: '1px solid #F09595', background: '#791F1F22', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '16px' }}>
              {validationWarning}
            </div>
          )}

          <div style={{ textAlign: 'left', marginBottom: '20px' }}>
            <p style={{ color: '#6ee7b7', fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}> Recommended first steps:</p>
            {recommendations.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start', cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                onClick={() => r.action && navigate(r.action)}
                onMouseEnter={e => e.currentTarget.style.background = '#0a3d22'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' && r.action) navigate(r.action) }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{r.icon}</span>
                <span style={{ color: '#9fe1cb', fontSize: '13px', lineHeight: '1.5' }}>{r.text}</span>
              </div>
            ))}
          </div>

          <button className="btn-primary full" onClick={handleFinish} disabled={loading} style={{ padding: '14px', fontSize: '15px' }}>
            {loading ? <span className="spinner"></span> : 'Start my journey →'}
          </button>
          {saveError && <p role="alert" style={{ color: '#F09595', fontSize: '13px', marginTop: '12px' }}>{saveError}</p>}

          <button onClick={() => { setStep(QUESTIONS.length - 1); triggerAnimate() }} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            â† Change my answers
          </button>
        </div>
      </div>
    )
  }

  //  Skip confirmation
  if (skipped) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #0a3d22', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#6ee7b7', fontSize: '14px' }}>Setting up your account...</p>
        </div>
      </div>
    )
  }

  if (!q) return null

  return (
    <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '16px', padding: '2rem', maxWidth: '500px', width: '100%', animation: 'fadeIn 0.3s ease-out' }}>
        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#3b7a5a', fontSize: '12px' }}>Question {step + 1} of {QUESTIONS.length}</span>
            <span style={{ color: '#f59e0b', fontSize: '12px' }}>{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Question */}
        <div style={{ marginBottom: '24px', animation: animate ? 'fadeIn 0.3s ease-out' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 600, fontFamily: "'Inter', sans-serif", margin: 0 }}>{q.title}</h2>
            {q.multi && <span style={{ color: '#3b7a5a', fontSize: '11px', background: '#041f13', padding: '2px 8px', borderRadius: '100px' }}>{(answers[q.id] || []).length} selected</span>}
          </div>
          <p style={{ color: '#3b7a5a', fontSize: '13px', marginBottom: '20px' }}>{q.subtitle}</p>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {q.options.map(option => {
              const selected = isSelected(q.id, option.value)
              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(q.id, option.value)}
                  role={q.multi ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: '12px',
                    border: selected ? '2px solid #f59e0b' : '1px solid #0a3d22',
                    background: selected ? '#0a3d22' : '#041f13',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
                    minHeight: '56px',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(q.id, option.value) } }}
                >
                  <span style={{ fontSize: '24px', flexShrink: 0 }}>{option.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#e2f5ec', fontSize: '14px', fontWeight: 500, margin: 0 }}>{option.label}</p>
                    {option.desc && <p style={{ color: '#3b7a5a', fontSize: '12px', margin: '2px 0 0' }}>{option.desc}</p>}
                  </div>
                  {selected && <span style={{ color: '#f59e0b', fontSize: '18px', marginLeft: 'auto', flexShrink: 0 }}></span>}
                </button>
              )
            })}
          </div>

          {/* Multi-select helper */}
          {q.multi && (answers[q.id] || []).length === 0 && (
            <p style={{ color: '#3b7a5a', fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>Tap to select — you can choose multiple</p>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {step > 0 && (
            <button onClick={prevStep} className="btn-ghost" style={{ flex: 1, padding: '14px', fontSize: '15px' }}>
              â† Back
            </button>
          )}
          <button
            className="btn-primary full"
            onClick={step < QUESTIONS.length - 1 ? nextStep : () => setStep(QUESTIONS.length)}
            style={{ padding: '14px', fontSize: '15px', flex: step > 0 ? 2 : 1 }}
          >
            {step < QUESTIONS.length - 1 ? 'Next →' : 'See my results →'}
          </button>
        </div>

        {/* Skip */}
        <button onClick={handleSkip} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          Skip for now
        </button>

        <p style={{ color: '#1d5c38', fontSize: '10px', textAlign: 'center', marginTop: '8px' }}>
          Your answers help us personalize your experience. You can change them later.
        </p>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
