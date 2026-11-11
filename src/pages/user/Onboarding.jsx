import { BrandLoader } from '../../components/Brand'
import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useI18n } from '../../i18n'

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
    titleKey: 'onboarding.q.frequency.title',
    subtitleKey: 'onboarding.q.frequency.subtitle',
    options: [
      { value: 'daily', descKey: 'onboarding.q.frequency.dailyDesc' },
      { value: 'weekly', descKey: 'onboarding.q.frequency.weeklyDesc' },
      { value: 'monthly', descKey: 'onboarding.q.frequency.monthlyDesc' },
      { value: 'rarely', descKey: 'onboarding.q.frequency.rarelyDesc' },
    ]
  },
  {
    id: 'spending',
    titleKey: 'onboarding.q.spending.title',
    subtitleKey: 'onboarding.q.spending.subtitle',
    options: [
      { value: 'high', descKey: 'onboarding.q.spending.highDesc' },
      { value: 'medium', descKey: 'onboarding.q.spending.mediumDesc' },
      { value: 'low', descKey: 'onboarding.q.spending.lowDesc' },
      { value: 'varies', descKey: 'onboarding.q.spending.variesDesc' },
    ]
  },
  {
    id: 'triggers',
    titleKey: 'onboarding.q.triggers.title',
    subtitleKey: 'onboarding.q.triggers.subtitle',
    multi: true,
    options: [
      { value: 'stress' },
      { value: 'boredom' },
      { value: 'sports' },
      { value: 'money' },
      { value: 'social' },
      { value: 'ads' },
    ]
  },
  {
    id: 'goal',
    titleKey: 'onboarding.q.goal.title',
    subtitleKey: 'onboarding.q.goal.subtitle',
    options: [
      { value: 'cut_down', descKey: 'onboarding.q.goal.cut_downDesc' },
      { value: 'abstinence', descKey: 'onboarding.q.goal.abstinenceDesc' },
      { value: 'maintain', descKey: 'onboarding.q.goal.maintainDesc' },
      { value: 'exploring', descKey: 'onboarding.q.goal.exploringDesc' },
    ]
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { t } = useI18n()
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

  const canProceed = useCallback(() => {
    const q = QUESTIONS[step]
    if (!q) return false
    if (q.multi) return (answers[q.id] || []).length > 0
    return !!answers[q.id]
  }, [step, answers])

  const nextStep = useCallback(() => {
    if (!canProceed()) {
      setValidationWarning(t('onboarding.validationWarning'))
      return
    }
    if (step >= QUESTIONS.length - 1) return
    triggerAnimate()
    const newStep = step + 1
    setStep(newStep)
    saveProgress(newStep, answers)
  }, [step, answers, triggerAnimate, saveProgress, canProceed, t])

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

    let riskLevel, riskColor, riskLabel
    if (s >= 7) { riskLevel = 'high'; riskColor = '#FFFFFF'; riskLabel = t('onboarding.risk.high') }
    else if (s >= 4) { riskLevel = 'medium'; riskColor = '#7DBDEE'; riskLabel = t('onboarding.risk.medium') }
    else { riskLevel = 'low'; riskColor = '#2DD4BF'; riskLabel = t('onboarding.risk.low') }

    const recs = []
    if (s >= 7) {
      recs.push({ textKey: 'onboarding.rec.high1', action: '/cbt' })
      recs.push({ textKey: 'onboarding.rec.high2', action: '/diary' })
      recs.push({ textKey: 'onboarding.rec.high3', action: '/resources' })
    } else if (s >= 4) {
      recs.push({ textKey: 'onboarding.rec.med1', action: '/diary' })
      recs.push({ textKey: 'onboarding.rec.med2', action: '/urge-toolkit' })
      recs.push({ textKey: 'onboarding.rec.med3', action: '/cbt' })
    } else {
      recs.push({ textKey: 'onboarding.rec.low1', action: '/diary' })
      recs.push({ textKey: 'onboarding.rec.low2', action: '/circle' })
      recs.push({ textKey: 'onboarding.rec.low3', action: '/dashboard' })
    }

    return {
      score: s,
      risk: { level: riskLevel, color: riskColor, label: riskLabel },
      recommendations: recs,
    }
  }, [answers, t])

  const progress = useMemo(() => ((step + 1) / QUESTIONS.length) * 100, [step])

  const handleFinish = async () => {
    setSaveError('')
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      const user = session.user
      const { error } = await supabase.from('profiles').update({
        onboarding_completed: true,
        screening_score: score,
        screening_answers: answers,
        risk_level: risk.level,
        goal: GOAL_MAP[answers.goal] || 'Abstinence',
        phone: user.user_metadata?.phone,
      }).eq('id', user.id)

      if (error) {
        console.error('Onboarding save error:', error)
        setSaveError(t('onboarding.saveError'))
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
      const user = session.user
      await supabase.from('profiles').update({
        onboarding_completed: true,
        onboarding_skipped: true,
        phone: user.user_metadata?.phone,
      }).eq('id', user.id)
    }
    sessionStorage.removeItem('onboarding_step')
    sessionStorage.removeItem('onboarding_answers')
    navigate('/dashboard', { replace: true })
  }

  const q = QUESTIONS[step]

  //  Results Screen
  if (step >= QUESTIONS.length) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '2.5rem 2rem', maxWidth: '500px', width: '100%', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
          <AppIcon name="flame" size={48} style={{ display: 'block', margin: '0 auto 12px', color: '#2DD4BF' }} />
          <h2 style={{ color: '#2DD4BF', fontFamily: 'var(--font-display)', fontSize: '22px', marginBottom: '8px' }}>{t('onboarding.journeyBegins')}</h2>

          <div style={{ background: '#0B1220', borderRadius: '12px', padding: '16px', margin: '16px 0', border: `2px solid ${risk.color}` }}>
            <p style={{ color: risk.color, fontSize: '14px', fontWeight: 600, margin: '8px 0 4px' }}>{risk.label}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{t('onboarding.riskNote')}</p>
          </div>

          {validationWarning && (
            <div role="alert" style={{ color: '#FFFFFF', border: '1px solid #FFFFFF', background: 'rgba(255,255,255,0.13)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '16px' }}>
              {validationWarning}
            </div>
          )}

          <div style={{ textAlign: 'left', marginBottom: '20px' }}>
            <p style={{ color: '#2DD4BF', fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>{t('onboarding.recommended')}</p>
            {recommendations.map((r, i) => (
              <button
                key={i}
                type="button"
                className="card-action"
                style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start', padding: '8px', borderRadius: '8px', border: 'none', background: 'transparent', textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                onClick={() => r.action && navigate(r.action)}
              >
                <span style={{ color: '#7DBDEE', fontSize: '13px', lineHeight: '1.5' }}>{t(r.textKey)}</span>
              </button>
            ))}
          </div>

          <button className="btn-primary full" onClick={handleFinish} disabled={loading} style={{ padding: '14px', fontSize: '15px' }}>
            {loading ? <BrandLoader variant="inline" showWordmark={false} /> : `${t('onboarding.start')} →`}
          </button>
          {saveError && <p role="alert" style={{ color: '#FFFFFF', fontSize: '13px', marginTop: '12px' }}>{saveError}</p>}

          <button onClick={() => { setStep(QUESTIONS.length - 1); triggerAnimate() }} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            ← {t('onboarding.changeAnswers')}
          </button>
        </div>
      </div>
    )
  }

  //  Skip confirmation
  if (skipped) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <BrandLoader variant="section" showWordmark={false} />
          <p style={{ color: '#2DD4BF', fontSize: '14px' }}>{t('onboarding.setup')}</p>
        </div>
      </div>
    )
  }

  if (!q) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '2rem', maxWidth: '500px', width: '100%', animation: 'fadeIn 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <LanguageSwitcher />
        </div>
        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{t('onboarding.progress', { current: step + 1, total: QUESTIONS.length })}</span>
            <span style={{ color: '#2DD4BF', fontSize: '12px' }}>{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Question */}
        <div style={{ marginBottom: '24px', animation: animate ? 'fadeIn 0.3s ease-out' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h2 style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-body)', margin: 0 }}>{t(q.titleKey)}</h2>
            {q.multi && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', background: '#0B1220', padding: '2px 8px', borderRadius: '100px' }}>{t('onboarding.selected', { count: (answers[q.id] || []).length })}</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '20px' }}>{t(q.subtitleKey)}</p>

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
                    border: selected ? '2px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)',
                    background: selected ? 'rgba(255,255,255,0.12)' : '#0B1220',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    transition: 'all 0.2s', fontFamily: 'var(--font-body)',
                    minHeight: '56px',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(q.id, option.value) } }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 500, margin: 0 }}>{t(`onboarding.q.${q.id}.${option.value}`)}</p>
                    {option.descKey && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '2px 0 0' }}>{t(option.descKey)}</p>}
                  </div>
                  {selected && <AppIcon name="check" size={18} style={{ marginLeft: 'auto', flexShrink: 0, color: '#2DD4BF' }} />}
                </button>
              )
            })}
          </div>

          {/* Multi-select helper */}
          {q.multi && (answers[q.id] || []).length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>{t('onboarding.multiHint')}</p>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {step > 0 && (
            <button onClick={prevStep} className="btn-ghost" style={{ flex: 1, padding: '14px', fontSize: '15px' }}>
              ← {t('onboarding.back')}
            </button>
          )}
          <button
            className="btn-primary full"
            onClick={step < QUESTIONS.length - 1 ? nextStep : () => setStep(QUESTIONS.length)}
            style={{ padding: '14px', fontSize: '15px', flex: step > 0 ? 2 : 1 }}
          >
            {step < QUESTIONS.length - 1 ? `${t('onboarding.next')} →` : `${t('onboarding.seeResults')} →`}
          </button>
        </div>

        {/* Skip */}
        <button onClick={handleSkip} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {t('onboarding.skip')}
        </button>

        <p style={{ color: '#7DBDEE', fontSize: '10px', textAlign: 'center', marginTop: '8px' }}>
          {t('onboarding.privacyNote')}
        </p>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
