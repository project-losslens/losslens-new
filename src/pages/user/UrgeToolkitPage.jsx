import { toast } from '../../components/ToastProvider'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { readAndMigrateStorageItem } from '../../lib/storage'
import AppIcon from '../../components/AppIcon'
import { HELPLINES as CONFIG_HELPLINES } from '../../config/helplines'
import { useI18n, translate, getLanguage } from '../../i18n'
import { enqueueOfflineItem } from '../../lib/offlineQueue'

//  Constants
const TIMER_DURATION = 600 // 10 minutes
const BREATH_INHALE = 4000
const BREATH_HOLD = 7000
const BREATH_EXHALE = 8000


function triggerConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const isMobile = window.innerWidth < 768
  const count = isMobile ? 25 : 50
  const colors = ['#2DD4BF', '#2DD4BF', '#2DD4BF', '#FFFFFF', '#7DBDEE', '#7DBDEE']
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const piece = document.createElement('div')
      piece.style.cssText = `position:fixed;width:${Math.random()*10+6}px;height:${Math.random()*10+6}px;background:${colors[Math.floor(Math.random()*colors.length)]};left:${Math.random()*100}%;top:-20px;z-index: var(--z-toast);pointer-events:none;border-radius:${Math.random()>0.5?'50%':'2px'};animation:confettiFall ${Math.random()*2+2}s ease-out forwards`
      document.body.appendChild(piece)
      setTimeout(() => piece.remove(), 3500)
    }, i * 20)
  }
  // Haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}

//  Static data outside component
const DISTRACTION_CHALLENGES = [
  'Physical', 'Physical', 'Physical', 'Social', 'Mental',
  'Physical', 'Creative', 'Creative', 'Relaxing', 'Mental',
  'Creative', 'Physical',
]

const EMOTIONS = ['Anxious', 'Bored', 'Stressed', 'Excited', 'Hopeless', 'Restless', 'Sad']
const NEW_EMOTIONS = ['Calmer', 'In control', 'Still struggling', 'Relieved', 'Empowered', 'Hopeful']

// Crisis numbers come only from src/config/helplines.js.
const HELPLINES = CONFIG_HELPLINES.map(h => ({
  name: h.name,
  number: h.phone,
  tel: h.tel,
  hours: h.hours,
  free: true,
}))

const TOOLS = [
  { id: 'timer', icon: 'clock', titleKey: 'toolkit.timerTitle', descKey: 'toolkit.timerDesc', color: '#2DD4BF' },
  { id: 'breathing', icon: 'heart', titleKey: 'toolkit.breathingTitle', descKey: 'toolkit.breathingDesc', color: '#2DD4BF' },
  { id: 'thought', icon: 'brain', titleKey: 'toolkit.thoughtTitle', descKey: 'toolkit.thoughtDesc', color: '#7DBDEE' },
  { id: 'distraction', icon: 'star', titleKey: 'toolkit.distractionTitle', descKey: 'toolkit.distractionDesc', color: '#2DD4BF' },
  { id: 'helpline', icon: 'phone', titleKey: 'toolkit.helplineTitle', descKey: 'toolkit.helplineDesc', color: '#FFFFFF' },
]

//  Breathing Human — React.memo for performance
const BreathingHuman = ({ phase, size = 200 }) => {
  const scale = phase === 'inhale' ? 1.1 : phase === 'hold' ? 1.1 : 1
  const bellyScale = phase === 'inhale' ? 1.3 : phase === 'exhale' ? 0.85 : 1.1
  return (
    <div style={{ width: size, height: size * 1.4, margin: '0 auto', position: 'relative', transition: 'all 4s ease-in-out' }} role="img" aria-label={translate(getLanguage(), 'toolkit.breathingAria', { phase: phase === 'inhale' ? translate(getLanguage(), 'toolkit.breatheIn') : phase === 'hold' ? translate(getLanguage(), 'toolkit.hold') : translate(getLanguage(), 'toolkit.breatheOut') })}>
      <div style={{ width: size*0.3, height: size*0.3, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #2DD4BF', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transition: 'transform 4s', transform: `scale(${scale})` }}>
        <div style={{ display: 'flex', gap: size*0.05 }}><div style={{ width: size*0.03, height: size*0.04, borderRadius: '50%', background: '#FFFFFF' }} /><div style={{ width: size*0.03, height: size*0.04, borderRadius: '50%', background: '#FFFFFF' }} /></div>
        <div style={{ width: size*0.05, height: size*0.02, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', marginTop: size*0.02 }} />
      </div>
      <div style={{ width: size*0.05, height: size*0.06, background: 'rgba(255,255,255,0.12)', margin: '0 auto' }} />
      <div style={{ width: size*0.45, height: size*0.55, borderRadius: '40% 40% 25% 25%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #2DD4BF', margin: '0 auto', position: 'relative', transition: 'transform 4s', transform: `scale(${scale})` }}>
        <div style={{ position: 'absolute', bottom: '15%', left: '20%', width: '60%', height: '45%', borderRadius: '50%', background: 'rgba(45,212,191,0.15)', border: '1px solid rgba(45,212,191,0.3)', transition: 'transform 4s', transform: `scale(${bellyScale})` }} />
        <div style={{ position: 'absolute', top: '10%', left: '-25%', width: '25%', height: '50%', background: 'rgba(255,255,255,0.12)', borderRadius: '30%', border: '1px solid #7DBDEE' }} />
        <div style={{ position: 'absolute', top: '10%', right: '-25%', width: '25%', height: '50%', background: 'rgba(255,255,255,0.12)', borderRadius: '30%', border: '1px solid #7DBDEE' }} />
      </div>
      <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', color: '#2DD4BF', fontSize: size*0.1, fontWeight: 600, fontFamily: 'var(--font-display)', textShadow: '0 0 10px rgba(11,18,32,0.8)' }}>
        {phase === 'inhale' ? translate(getLanguage(), 'toolkit.breatheIn') : phase === 'hold' ? translate(getLanguage(), 'toolkit.hold') : translate(getLanguage(), 'toolkit.breatheOut')}
      </div>
    </div>
  )
}

function isOpenNow(hours) {
  if (!hours) return false
  if (hours.toLowerCase().includes('24/7')) return true
  const now = new Date()
  const kenyaHour = now.getUTCHours() + 3
  const day = now.getDay()
  if (hours.toLowerCase().includes('mon-fri') && day >= 1 && day <= 5 && kenyaHour >= 8 && kenyaHour < 17) return true
  if (hours.toLowerCase().includes('8am-5pm') && kenyaHour >= 8 && kenyaHour < 17) return true
  return false
}

export default function UrgeToolkitPage() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const [activeTool, setActiveTool] = useState(null)
  const [userId, setUserId] = useState(null)
  const userIdRef = useRef(null)

  // Timer
  const [timer, setTimer] = useState(TIMER_DURATION)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerComplete, setTimerComplete] = useState(false)
  const timerRef = useRef(null)

  // Breathing
  const [breathPhase, setBreathPhase] = useState('inhale')
  const [breathRounds, setBreathRounds] = useState(0)
  const [breathingActive, setBreathingActive] = useState(false)
  const breathingRef = useRef(null)

  // Thought Challenger
  const [thoughtRecord, setThoughtRecord] = useState({ situation: '', automaticThought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '', newEmotion: '' })
  const [thoughtStep, setThoughtStep] = useState(0)
  const [copingCards, setCopingCards] = useState([])

  // Distraction
  const [spinning, setSpinning] = useState(false)
  const [randomChallenge, setRandomChallenge] = useState(null)
  const [challengeAccepted, setChallengeAccepted] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)

  // Helpline
  const [showAddPartner, setShowAddPartner] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [accountabilityPartner, setAccountabilityPartner] = useState(null)

  useEffect(() => { fetchUser(); loadCopingCards(); return () => cleanup() }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (breathingRef.current) clearTimeout(breathingRef.current)
  }, [])

  const fetchUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) { setUserId(session.user.id); userIdRef.current = session.user.id }
  }

  // Log a toolkit session to Supabase; queue locally when offline or on failure.
  const logSession = async (tool, extra = {}) => {
    const uid = userIdRef.current
    if (!uid) return
    const payload = { user_id: uid, tool, completed: true, metadata: extra }
    const offline = () => enqueueOfflineItem('urge_session', payload).then(() => toast.success(translate(getLanguage(), 'toolkit.sessionSaved'), 3000))
    if (typeof navigator !== 'undefined' && !navigator.onLine) { await offline(); return }
    const { error } = await supabase.from('urge_toolkit_sessions').insert(payload)
    if (error) await offline()
  }

  const loadCopingCards = () => {
    try {
      const saved = readAndMigrateStorageItem('losslens_coping_cards', 'precious_coping_cards')
      if (saved) setCopingCards(JSON.parse(saved))
    } catch {}
  }

  const loadPartner = async () => {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('accountability_partner_name, accountability_partner_phone').eq('id', userId).single()
    if (data?.accountability_partner_name) setAccountabilityPartner({ name: data.accountability_partner_name, phone: data.accountability_partner_phone })
  }

  useEffect(() => { if (userId) loadPartner() }, [userId])

  //  Timer logic with proper cleanup
  useEffect(() => {
    if (timerRunning && timer > 0) {
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) { setTimerRunning(false); setTimerComplete(true); triggerConfetti(); toast.success(`${translate(getLanguage(), 'toolkit.youMadeIt')}`, 4000); void logSession('timer', { duration_seconds: TIMER_DURATION }); return 0 }
          return t - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [timerRunning])

  //  Breathing — actual 4-7-8 with dynamic timeouts
  useEffect(() => {
    if (!breathingActive || activeTool !== 'breathing') return
    let cancelled = false

    const runCycle = async () => {
      while (!cancelled) {
        setBreathPhase('inhale')
        await new Promise(r => breathingRef.current = setTimeout(r, BREATH_INHALE))
        if (cancelled) return
        setBreathPhase('hold')
        await new Promise(r => breathingRef.current = setTimeout(r, BREATH_HOLD))
        if (cancelled) return
        setBreathPhase('exhale')
        await new Promise(r => breathingRef.current = setTimeout(r, BREATH_EXHALE))
        if (cancelled) return
        setBreathRounds(r => r + 1)
      }
    }
    runCycle()

    return () => { cancelled = true; if (breathingRef.current) clearTimeout(breathingRef.current) }
  }, [breathingActive, activeTool])

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const getTimerProgress = () => ((TIMER_DURATION - timer) / TIMER_DURATION) * 100

  //  Spinning wheel — fixed seed for bar heights
  const voiceBarHeights = useMemo(() => [1,2,3,4,5,6,7,8].map(i => 15 + Math.sin(i * 1.5) * 10), [])

  const spinWheel = () => {
    setSpinning(true); setChallengeAccepted(false); setChallengeDone(false)
    let spins = 0; const maxSpins = 20
    const spinInterval = setInterval(() => {
      setRandomChallenge(Math.floor(Math.random() * DISTRACTION_CHALLENGES.length))
      spins++
      if (spins >= maxSpins) { clearInterval(spinInterval); setSpinning(false); setRandomChallenge(Math.floor(Math.random() * DISTRACTION_CHALLENGES.length)) }
    }, 100)
  }

  const savePartner = async () => {
    if (!partnerName.trim()) return
    if (partnerPhone && !/^(\+254|0)?7\d{8}$/.test(partnerPhone.replace(/\s/g, ''))) { toast.error(t('toolkit.invalidPhone')); return }
    try {
      await supabase.from('profiles').update({ accountability_partner_name: partnerName, accountability_partner_phone: partnerPhone }).eq('id', userId)
      setAccountabilityPartner({ name: partnerName, phone: partnerPhone })
      setShowAddPartner(false)
      toast.success(`${t('toolkit.partnerSaved')}`, 3000)
    } catch (err) { toast.error(t('toolkit.saveFailed'), 2000) }
  }

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div><h1 className="fs-18" style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}> {t('toolkit.title')}</h1><p className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{t('toolkit.subtitle')}</p></div>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {!activeTool && (
            <div className="urge-hero" style={{ marginBottom: '1.25rem' }}>
              <button type="button" className="btn-primary urge-hero__start" onClick={() => { setActiveTool('timer'); setTimerComplete(false); setTimer(TIMER_DURATION); setTimerRunning(true) }}>
                {t('toolkit.heroTitle')}
              </button>
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', margin: '10px 0 0' }}>{t('toolkit.heroSub')}</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" onClick={() => { setActiveTool('breathing'); setBreathPhase('inhale'); setBreathRounds(0); setBreathingActive(true) }}>{t('toolkit.breathe')}</button>
                <button type="button" className="btn-secondary" onClick={() => { setActiveTool('helpline') }}>{t('toolkit.callSupport')}</button>
                <button type="button" className="btn-secondary" onClick={() => { setActiveTool('thought'); setThoughtStep(0) }}>{t('toolkit.ground')}</button>
              </div>
            </div>
          )}
          <div className="tools-grid" style={{ marginBottom: '1rem' }}>
            {TOOLS.map(tool => (
              <div key={tool.id} className={`tool-card ${activeTool === tool.id ? 'tool-active' : ''}`}
                onClick={() => {
                  if (activeTool === tool.id) {
                    setActiveTool(null)
                    setBreathingActive(false)
                  } else {
                    setActiveTool(tool.id)
                    if (tool.id === 'timer') { setTimerComplete(false); setTimer(TIMER_DURATION); setTimerRunning(false) }
                    if (tool.id === 'breathing') { setBreathPhase('inhale'); setBreathRounds(0); setBreathingActive(true) }
                    if (tool.id === 'thought') setThoughtStep(0)
                    if (tool.id === 'distraction') { setRandomChallenge(null); setChallengeAccepted(false); setChallengeDone(false); setSpinning(false) }
                  }
                }}
                style={activeTool === tool.id ? { borderColor: tool.color } : {}}
                role="button"
                tabIndex={0}
                aria-pressed={activeTool === tool.id}
                onKeyDown={e => { if (e.key === 'Enter') {
                  if (activeTool === tool.id) { setActiveTool(null); setBreathingActive(false) }
                  else { setActiveTool(tool.id); if (tool.id === 'timer') { setTimerComplete(false); setTimer(TIMER_DURATION); setTimerRunning(false) }; if (tool.id === 'breathing') { setBreathPhase('inhale'); setBreathRounds(0); setBreathingActive(true) }; if (tool.id === 'thought') setThoughtStep(0); if (tool.id === 'distraction') { setRandomChallenge(null); setChallengeAccepted(false); setChallengeDone(false); setSpinning(false) } }
                }}}
              >
                <AppIcon name={tool.icon} size={28} className="tool-icon" />
                <h3 className="tool-title">{t(tool.titleKey)}</h3>
                <p className="tool-desc">{t(tool.descKey)}</p>
              </div>
            ))}
          </div>

          {/* ─── TIMER ─── */}
          {activeTool === 'timer' && (
            <div className="dash-section" style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
              <h3 className="fs-16" style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>{t('toolkit.timerHeading')}</h3>
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>{t('toolkit.timerSub')}</p>
              <div style={{ position: 'relative', width: '200px', height: '200px', margin: '0 auto' }} role="timer" aria-label={`Countdown timer: ${formatTime(timer)} remaining`}>
                <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2DD4BF" /><stop offset="100%" stopColor="#7DBDEE" />
                    </linearGradient>
                  </defs>
                  <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                  <circle cx="100" cy="100" r="88" fill="none" stroke={timerComplete ? '#2DD4BF' : 'url(#timerGradient)'} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 88}`} strokeDashoffset={`${2 * Math.PI * 88 * (1 - getTimerProgress() / 100)}`}
                    style={{ transition: 'stroke-dashoffset 1s linear', filter: timerRunning ? 'drop-shadow(0 0 8px rgba(45,212,191,0.5))' : 'none' }} />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: timerComplete ? '1rem' : '2.5rem', color: timerComplete ? '#2DD4BF' : '#2DD4BF', fontWeight: 700 }}>{timerComplete ? ` ${t('toolkit.done')}` : formatTime(timer)}</div>
                  {!timerComplete && <div className="fs-12" style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{timerRunning ? t('toolkit.hangOn') : t('toolkit.pressStart')}</div>}
                </div>
              </div>
              <div className="toggle-group" style={{ marginTop: '1.5rem', justifyContent: 'center' }}>
                {!timerComplete ? (
                  <>
                    <button className="toggle-btn active-primary" onClick={() => setTimerRunning(!timerRunning)} style={{ flex: '0 1 auto', minWidth: '100px' }}>{timerRunning ? `${t('toolkit.pause')}` : timer === TIMER_DURATION ? `${t('toolkit.start')}` : `${t('toolkit.resume')}`}</button>
                    <button className="toggle-btn" onClick={() => { setTimer(TIMER_DURATION); setTimerRunning(false); setTimerComplete(false) }} style={{ flex: '0 1 auto', minWidth: '100px' }}>{t('toolkit.reset')} ↺</button>
                  </>
                ) : (
                  <div style={{ width: '100%' }}>
                    <p className="fs-14" style={{ color: '#2DD4BF', marginBottom: '1rem' }}> {t('toolkit.proved')}</p>
                    <button className="btn-primary" onClick={() => { setTimer(TIMER_DURATION); setTimerRunning(false); setTimerComplete(false) }} style={{ width: '100%' }}>{t('toolkit.newTimer')}</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── BREATHING ─── */}
          {activeTool === 'breathing' && (
            <div className="dash-section" style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
              <h3 className="fs-16" style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>{t('toolkit.breathingHeading')}</h3>
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>{t('toolkit.breathingSub')}</p>
              <BreathingHuman phase={breathPhase} size={180} />
              <div style={{ marginTop: '1rem' }}>
                <p className="fs-14" style={{ color: '#2DD4BF', fontWeight: 500 }} aria-live="polite">{t('toolkit.round', { count: breathRounds + 1 })}</p>
                {breathRounds >= 3 && <p className="fs-14" style={{ color: '#2DD4BF', marginTop: '0.5rem' }}> {t('toolkit.roundComplete', { count: breathRounds })}</p>}
              </div>
              <button className="toggle-btn active-primary" onClick={() => setBreathingActive(!breathingActive)} style={{ marginTop: '1rem', minWidth: '120px' }}>
                {breathingActive ? `${t('toolkit.pause')}` : `${t('toolkit.start')}`}
              </button>
            </div>
          )}

          {/* ─── THOUGHT CHALLENGER ─── */}
          {activeTool === 'thought' && (
            <div className="dash-section" style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <h3 className="fs-16" style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>{t('toolkit.thoughtRecord')}</h3>
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1rem' }}>{t('toolkit.thoughtFromCbt')}</p>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem' }}>
                {['situation', 'thought', 'evidence', 'balance'].map((step, i) => (
                  <div key={i} style={{ flex: 1, height: '6px', borderRadius: '3px', background: thoughtStep >= i ? '#2DD4BF' : 'rgba(255,255,255,0.12)', transition: 'background 0.3s' }} />
                ))}
              </div>
              {thoughtStep === 0 && (
                <>
                  <div className="form-group"><label htmlFor="situation">{t('toolkit.situationLabel')}</label><textarea id="situation" className="diary-textarea" placeholder={t('toolkit.situationPlaceholder')} value={thoughtRecord.situation} onChange={e => setThoughtRecord({ ...thoughtRecord, situation: e.target.value })} rows={2} /></div>
                  <div className="form-group" style={{ marginTop: '12px' }}><label>{t('toolkit.emotionLabel')}</label><div className="chip-group">{EMOTIONS.map(e => <button key={e} className={`chip ${thoughtRecord.emotion===e?'chip-active':''}`} onClick={()=>setThoughtRecord({...thoughtRecord,emotion:e})}>{t(`toolkit.emotion.${e}`)}</button>)}</div></div>
                  <button className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => thoughtRecord.situation && setThoughtStep(1)} disabled={!thoughtRecord.situation}>{t('toolkit.next')} →</button>
                </>
              )}
              {thoughtStep === 1 && (
                <>
                  <div className="form-group"><label htmlFor="autoThought">{t('toolkit.automaticThoughtLabel')}</label><textarea id="autoThought" className="diary-textarea" placeholder={t('toolkit.automaticThoughtPlaceholder')} value={thoughtRecord.automaticThought} onChange={e => setThoughtRecord({ ...thoughtRecord, automaticThought: e.target.value })} rows={2} /></div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}><button className="btn-ghost" onClick={()=>setThoughtStep(0)}>← {t('toolkit.back')}</button><button className="btn-primary" style={{flex:1}} onClick={()=>thoughtRecord.automaticThought&&setThoughtStep(2)} disabled={!thoughtRecord.automaticThought}>{t('toolkit.next')} →</button></div>
                </>
              )}
              {thoughtStep === 2 && (
                <>
                  <div className="form-group"><label htmlFor="evidenceFor">{t('toolkit.evidenceForLabel')}</label><textarea id="evidenceFor" className="diary-textarea" placeholder={t('toolkit.evidenceForPlaceholder')} value={thoughtRecord.evidenceFor} onChange={e => setThoughtRecord({ ...thoughtRecord, evidenceFor: e.target.value })} rows={2} /></div>
                  <div className="form-group" style={{marginTop:'12px'}}><label htmlFor="evidenceAgainst">{t('toolkit.evidenceAgainstLabel')}</label><textarea id="evidenceAgainst" className="diary-textarea" placeholder={t('toolkit.evidenceAgainstPlaceholder')} value={thoughtRecord.evidenceAgainst} onChange={e => setThoughtRecord({ ...thoughtRecord, evidenceAgainst: e.target.value })} rows={2} /></div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}><button className="btn-ghost" onClick={()=>setThoughtStep(1)}>← {t('toolkit.back')}</button><button className="btn-primary" style={{flex:1}} onClick={()=>setThoughtStep(3)}>{t('toolkit.next')} →</button></div>
                </>
              )}
              {thoughtStep === 3 && (
                <>
                  <div className="form-group"><label htmlFor="balancedThought">{t('toolkit.balancedThoughtLabel')}</label><textarea id="balancedThought" className="diary-textarea" placeholder={t('toolkit.balancedThoughtPlaceholder')} value={thoughtRecord.balancedThought} onChange={e => setThoughtRecord({ ...thoughtRecord, balancedThought: e.target.value })} rows={2} /></div>
                  <div className="form-group" style={{marginTop:'12px'}}><label>{t('toolkit.feelingNowLabel')}</label><div className="chip-group">{NEW_EMOTIONS.map(e => <button key={e} className={`chip ${thoughtRecord.newEmotion===e?'chip-active':''}`} onClick={()=>setThoughtRecord({...thoughtRecord,newEmotion:e})}>{t(`toolkit.newEmotion.${e}`)}</button>)}</div></div>
                  {thoughtRecord.balancedThought && (
                    <div style={{marginTop:'1rem',padding:'16px',background:'rgba(255,255,255,0.12)',borderRadius:'12px',border:'1px solid #7DBDEE'}}>
                      <p className="fs-12" style={{color:'#2DD4BF',marginBottom:'8px',textTransform:'uppercase'}}> {t('toolkit.copingCard')}</p>
                      <p className="fs-12" style={{color:'rgba(255,255,255,0.4)'}}><strong>{t('toolkit.oldThought')}</strong> "{thoughtRecord.automaticThought}"</p>
                      <p className="fs-12" style={{color:'#2DD4BF'}}><strong>{t('toolkit.newThought')}</strong> "{thoughtRecord.balancedThought}"</p>
                      <p className="fs-12" style={{color:'rgba(255,255,255,0.4)',marginTop:'4px'}}><strong>{t('toolkit.feeling')}</strong> {thoughtRecord.emotion ? t(`toolkit.emotion.${thoughtRecord.emotion}`) : '...'} → {thoughtRecord.newEmotion ? t(`toolkit.newEmotion.${thoughtRecord.newEmotion}`) : '...'}</p>
                      <button className="btn-primary" style={{width:'100%',marginTop:'12px'}} onClick={()=>{
                        const newCard = { id: Date.now(), date: new Date().toISOString(), ...thoughtRecord }
                        const updated = [newCard, ...copingCards].slice(0, 20)
                        setCopingCards(updated)
                        try { localStorage.setItem('losslens_coping_cards', JSON.stringify(updated)) } catch {}
                        toast.success(`${t('toolkit.copingCardSaved')}`, 3000)
                        void logSession('thought_record', { situation: thoughtRecord.situation, emotion: thoughtRecord.emotion })
                        setThoughtStep(0)
                        setThoughtRecord({ situation: '', automaticThought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '', newEmotion: '' })
                      }}> {t('toolkit.saveCopingCard')}</button>
                    </div>
                  )}
                  <button className="btn-ghost" style={{width:'100%',marginTop:'0.5rem'}} onClick={()=>setThoughtStep(2)}>← {t('toolkit.back')}</button>
                </>
              )}
              {copingCards.length > 0 && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '1rem' }}>
                  <h4 className="fs-13" style={{ color: '#FFFFFF', marginBottom: '8px' }}> {t('toolkit.copingCards', { count: copingCards.length })}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {copingCards.slice(0, 5).map(card => (
                      <div key={card.id} className="fs-12" style={{ background: '#0B1220', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#2DD4BF', fontWeight: 500 }}>{new Date(card.date).toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-KE')}</span>
                          <button onClick={() => { const updated = copingCards.filter(c => c.id !== card.id); setCopingCards(updated); try { localStorage.setItem('losslens_coping_cards', JSON.stringify(updated)) } catch {} }} className="fs-12" style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: '4px 8px' }} aria-label={t('toolkit.deleteCard')}></button>
                        </div>
                        <p style={{ color: '#FFFFFF', margin: '0 0 2px', textDecoration: 'line-through' }}>"{card.automaticThought}"</p>
                        <p style={{ color: '#2DD4BF', margin: 0 }}>→ "{card.balancedThought}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── SPINNING WHEEL ─── */}
          {activeTool === 'distraction' && (
            <div className="dash-section" style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
              <h3 className="fs-16" style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>{t('toolkit.distractionTitle')}</h3>
              <p className="fs-13" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>{t('toolkit.spinDesc')}</p>
              <div style={{ position: 'relative', width: '180px', height: '180px', margin: '0 auto 1.5rem' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'conic-gradient(#2DD4BF 0deg 60deg, #2DD4BF 60deg 120deg, #7DBDEE 120deg 180deg, #2DD4BF 180deg 240deg, #FFFFFF 240deg 300deg, #7DBDEE 300deg 360deg)', animation: spinning ? 'wheelSpin 1s ease-out' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(45,212,191,0.3)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="fs-20">{spinning ? '' : ''}</span></div>
                </div>
                <div className="fs-20" style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)' }}>▼</div>
              </div>
              {!randomChallenge ? (
                <button className="btn-primary fs-16" style={{ padding: '16px 32px' }} onClick={spinWheel} disabled={spinning}>{spinning ? ` ${t('toolkit.spinning')}` : ` ${t('toolkit.spinWheel')}`}</button>
              ) : (
                <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                  <div style={{ background: '#0B1220', border: `2px solid ${challengeDone ? '#2DD4BF' : '#2DD4BF'}`, borderRadius: '16px', padding: '24px', marginBottom: '1rem', transition: 'border-color 0.3s' }}>
                    <p className="fs-16" style={{ color: '#FFFFFF', fontWeight: 500, marginBottom: '8px' }}>{t(`toolkit.challenge.${randomChallenge}`)}</p>
                    <span className="fs-12" style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '4px 12px', borderRadius: '100px' }}>{t(`toolkit.category.${DISTRACTION_CHALLENGES[randomChallenge]}`)}</span>
                  </div>
                  {!challengeAccepted ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setChallengeAccepted(true); toast.success(`${t('toolkit.youGotThis')}`, 2000) }}> {t('toolkit.accept')}</button>
                      <button className="btn-ghost" style={{ flex: 1 }} onClick={spinWheel} disabled={spinning}> {t('toolkit.spinAgain')}</button>
                    </div>
                  ) : !challengeDone ? (
                    <button className="btn-primary" style={{ width: '100%', background: '#2DD4BF', color: '#0B1220' }} onClick={() => { setChallengeDone(true); triggerConfetti(); toast.success(`${t('toolkit.challengeComplete')}`, 3000); void logSession('distraction', { challenge: randomChallenge }) }}> {t('toolkit.iDidIt')}</button>
                  ) : (
                    <div><p className="fs-14" style={{ color: '#2DD4BF', marginBottom: '1rem' }}> {t('toolkit.urgeFaded')}</p><button className="btn-primary" style={{ width: '100%' }} onClick={() => { setRandomChallenge(null); setChallengeAccepted(false); setChallengeDone(false) }}> {t('toolkit.spinAgain')}</button></div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── HELPLINE ─── */}
          {activeTool === 'helpline' && (
            <div className="dash-section" style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <h3 className="fs-16" style={{ color: '#FFFFFF', marginBottom: '1rem' }}>{t('toolkit.helplineTitle')} </h3>
              {HELPLINES.map((h, i) => (
                <div key={i} className="helpline-card" style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <p className="helpline-name" style={{ margin: 0 }}>{h.name}</p>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOpenNow(h.hours) ? '#2DD4BF' : 'rgba(255,255,255,0.4)', flexShrink: 0 }} title={isOpenNow(h.hours) ? t('toolkit.availableNow') : t('toolkit.mayBeClosed')} />
                  </div>
                  <p className="helpline-num">{h.number}</p>
                  <p className="helpline-hours">{h.hours}  · {h.free ? t('toolkit.free') : ` ${t('toolkit.chargesMayApply')}`}</p>
                  <a href={`tel:${h.tel || h.number.replace(/\s/g,'')}`} className="fs-13" style={{ display: 'block', textAlign: 'center', background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: 500, marginTop: '8px' }}> {t('toolkit.callNumber', { number: h.number })}</a>
                </div>
              ))}
              <div style={{ marginTop: '1rem', padding: '16px', background: '#0B1220', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
                <h4 className="fs-14" style={{ color: '#FFFFFF', marginBottom: '8px' }}> {t('toolkit.accountabilityPartner')}</h4>
                {accountabilityPartner ? (
                  <div>
                    <p className="fs-14" style={{ color: '#FFFFFF' }}>{accountabilityPartner.name}</p>
                    {accountabilityPartner.phone && <a href={`tel:${accountabilityPartner.phone}`} className="fs-13" style={{ display: 'block', textAlign: 'center', background: '#2DD4BF', color: '#0B1220', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: 500, marginTop: '8px' }}> {t('toolkit.callNumber', { number: accountabilityPartner.name })}</a>}
                    <button className="btn-ghost fs-12" style={{ width: '100%', marginTop: '8px' }} onClick={() => setShowAddPartner(true)}> {t('toolkit.change')}</button>
                  </div>
                ) : (
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => setShowAddPartner(true)}>+ {t('toolkit.addPartner')}</button>
                )}
                {showAddPartner && (
                  <div style={{ marginTop: '12px' }}>
                    <div className="form-group"><label>{t('toolkit.partnerNameLabel')}</label><input type="text" value={partnerName} onChange={e => setPartnerName(e.target.value)} /></div>
                    <div className="form-group"><label>{t('toolkit.partnerPhoneLabel')}</label><input type="tel" value={partnerPhone} onChange={e => setPartnerPhone(e.target.value)} /></div>
                    <div style={{ display: 'flex', gap: '8px' }}><button className="btn-ghost" style={{ flex: 1 }} onClick={() => setShowAddPartner(false)}>{t('toolkit.cancel')}</button><button className="btn-primary" style={{ flex: 1 }} onClick={savePartner}>{t('toolkit.save')}</button></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes confettiFall { 0%{transform:translateY(-100%) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
        @keyframes wheelSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(1080deg)} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}
