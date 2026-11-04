import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

// ✅ Toast helper using React state instead of DOM manipulation
function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: #1d5c38; color: #6ee7b7; padding: 10px 20px; border-radius: 100px;
    font-size: 13px; font-weight: 500; z-index: 3000;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 1px solid #3b7a5a;
    animation: slideInRight 0.3s ease-out; white-space: nowrap;
  `
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in forwards'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

// ✅ Confetti respects reduced motion
function triggerConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const isMobile = window.innerWidth < 768
  const count = isMobile ? 30 : 60
  const colors = ['#f59e0b', '#6ee7b7', '#3db88a', '#F09595', '#FAC775', '#9fe1cb']
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const piece = document.createElement('div')
      piece.style.cssText = `
        position: fixed; width: ${Math.random() * 10 + 6}px; height: ${Math.random() * 10 + 6}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}%; top: -20px; z-index: 9999; pointer-events: none;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation: confettiFall ${Math.random() * 2 + 2}s ease-out forwards;
      `
      document.body.appendChild(piece)
      setTimeout(() => piece.remove(), 3500)
    }, i * 20)
  }
}

function CBTModules() {
  const navigate = useNavigate()
  const [activeModule, setActiveModule] = useState(null)
  const [completedIds, setCompletedIds] = useState([])
  const [userId, setUserId] = useState(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebratingModule, setCelebratingModule] = useState(null)
  const [activeLesson, setActiveLesson] = useState(null)
  const [badgeEarned, setBadgeEarned] = useState(null)
  const [saving, setSaving] = useState(false)
  const celebrationTimer = useRef(null)

  // ✅ Cleanup celebration timer
  useEffect(() => { return () => { if (celebrationTimer.current) clearTimeout(celebrationTimer.current) } }, [])

  const modules = [
    {
      id: 1, title: 'Understanding Your Gambling', duration: '8 min', icon: '🎯',
      preview: 'Discover what gambling harm really means and learn to spot your personal triggers.',
      description: 'Learn what gambling harm looks like and identify your personal triggers.',
      howItHelps: "You'll understand WHY you gamble — the first step to breaking the cycle.",
      outcome: "After this module, you'll be able to spot your triggers before they lead to urges.",
      lessons: [
        { title: 'What is gambling harm?', readTime: '3 min', content: `Gambling harm isn't just about losing money. It's a spectrum that affects your mental health, relationships, work, and self-worth.\n\nIn Kenya, sports betting has exploded — especially among young men. The Premier League isn't just entertainment anymore; it's become a trigger for millions.\n\nGambling harm happens when:\n• You spend more than you planned\n• You chase losses hoping to "recover"\n• It affects your mood, sleep, or relationships\n• You hide your betting from loved ones\n• You use M-Pesa loans or borrow to bet\n\nThe good news? Recognizing where you are is the first and most powerful step. This isn't about shame — it's about awareness.`, reflection: 'Think about your own gambling. Where do you fall on the spectrum? Be honest with yourself.' },
        { title: 'Identifying your personal triggers', readTime: '3 min', content: `Triggers are situations, feelings, or thoughts that push you toward gambling.\n\nCommon triggers in Kenya:\n• 📱 M-Pesa balance notifications\n• ⚽ Premier League match days\n• 😔 Stress from unemployment\n• 🍻 Peer pressure\n• 📺 Ads and promotions\n• 😴 Boredom or loneliness\n\nYour task: Notice what happens right BEFORE the urge. Write it down. Patterns will emerge.`, reflection: 'What are YOUR top 3 triggers? Write them down where you can see them daily.' },
        { title: 'The gambling cycle', readTime: '2 min', content: `TRIGGER → URGE → ACTION → CONSEQUENCE → GUILT → (back to TRIGGER)\n\nBreaking this cycle means interrupting it EARLY — at the trigger or urge stage. Every module from here will give you tools to do exactly that.`, reflection: 'Draw your own gambling cycle. Where could YOU interrupt it?' },
      ]
    },
    {
      id: 2, title: 'Challenging Cognitive Distortions', duration: '10 min', icon: '🧩',
      preview: 'Your brain plays tricks on you. Learn to catch the lies your mind tells you.',
      description: 'Recognize and challenge the thoughts that keep you gambling.',
      howItHelps: 'Your brain plays tricks. This module exposes them so they lose power.',
      outcome: "You'll catch distorted thoughts in real-time and replace them with reality.",
      lessons: [
        { title: "The \"I'll win it back\" trap", readTime: '4 min', content: `This is the Sunk Cost Fallacy.\n\nYou've lost KES 5,000. Your brain says: "You can't stop now — recover that money." You bet more, losing even more.\n\nThe truth: That money is GONE. Every new bet is a NEW risk.\n\nAccepting losses is powerful. It's saying: "That happened, but I'm choosing a different path now."`, reflection: 'Think of a time you chased losses. What would you tell a friend in that situation?' },
        { title: '"I\'m due for a win" — Really?', readTime: '3 min', content: `The Gambler's Fallacy: believing past losses make a win more likely.\n\nReality: Each bet is independent. A coin that lands heads 10 times still has 50% chance on the 11th.\n\nInstead of "I'm due," try: "Each bet is a fresh risk. Can I afford to lose?"`, reflection: 'Have you ever thought "I\'m due for a win"? What happened next?' },
        { title: '"I have a system" — The illusion', readTime: '3 min', content: `Many gamblers believe they've figured out a "system."\n\nTruth: If systems worked, betting companies would go bankrupt. They make billions.\n\nYour analytical mind is powerful — redirect it toward tracking your savings, planning goals, or learning new skills.`, reflection: 'What could you achieve if you redirected your betting energy into something constructive?' },
      ]
    },
    {
      id: 3, title: 'Urge Surfing', duration: '7 min', icon: '🌊',
      preview: 'Urges feel overwhelming but always pass. Learn to ride them like waves.',
      description: 'Learn to ride out urges without acting on them.',
      howItHelps: 'Urges feel overwhelming but they ALWAYS pass.',
      outcome: "When an urge hits, you'll have a 15-minute protocol that works.",
      lessons: [
        { title: 'Urges are temporary waves', readTime: '3 min', content: `An urge is like a wave: it builds, peaks, crashes, and fades. Most last 15-30 minutes.\n\nHave you ever had an urge, got distracted, and realized later it was gone? That's proof.\n\nYour brain's craving system can't tell time. It feels permanent but it's not.`, reflection: 'Next time you feel an urge, start a timer. See how long it actually lasts.' },
        { title: 'The 15-minute rule', readTime: '2 min', content: `1. Notice: "I'm feeling an urge"\n2. Commit to waiting 15 minutes\n3. Do something — anything — else\n4. Check: Is the urge still as strong?\n\nActivities: Walk, call a friend, music, pushups, clean, write.\n\n90% of the time, the urge passes or weakens.`, reflection: 'Create your "15-minute playlist" — 3 activities for when urges hit.' },
        { title: 'Body scanning', readTime: '2 min', content: `Where do urges live in your body? Chest tightness? Racing heart? Restless legs?\n\nThese physical sensations ARE the urge. They're uncomfortable but not dangerous.\n\nNext urge, sit with it for 2 minutes. Just observe. Rate it 1-10. Watch it change.`, reflection: 'Practice body scanning once today — even without an urge.' },
      ]
    },
    {
      id: 4, title: 'Trigger Management', duration: '9 min', icon: '⚡',
      preview: 'Build a personalized strategy to handle your specific triggers.',
      description: 'Build strategies to handle your specific triggers.',
      howItHelps: 'Intercept the process at the trigger stage — before it becomes an urge.',
      outcome: "You'll have a written plan for your top 3 triggers.",
      lessons: [
        { title: 'Avoidance vs. exposure', readTime: '3 min', content: `AVOIDANCE: Block betting sites, unfollow gambling accounts, avoid betting shops, turn off M-Pesa notifications.\n\nEXPOSURE: Build resistance gradually — watch matches without betting, keep M-Pesa with a budget.\n\nStart with avoidance for strong triggers. Build exposure later.`, reflection: "What's your strongest trigger? What's ONE thing you can do TODAY?" },
        { title: 'Environmental restructuring', readTime: '3 min', content: `Your environment shapes behavior more than willpower.\n\n• Delete betting apps\n• Use M-Pesa "lock savings"\n• Change match-day routines\n• Put phone in another room\n• Auto-savings on payday\n\nSmall changes = big results.`, reflection: "What's ONE environmental change you can make right now?" },
        { title: 'Social support activation', readTime: '3 min', content: `You don't have to do this alone.\n\n• Who knows about your journey?\n• Who can you call when urges hit?\n• What to say: "I'm working on reducing gambling. Can I call you if I'm struggling?"\n\nIf you have no one yet, use Oloo. That's why he's here.`, reflection: 'Who is ONE person you could talk to? What would you say?' },
      ]
    },
    {
      id: 5, title: 'Coping Strategies', duration: '8 min', icon: '🛡️',
      preview: 'Build a personal toolkit of healthy alternatives to gambling.',
      description: 'Build a personal toolkit of coping strategies.',
      howItHelps: "When triggers can't be avoided, coping strategies are your shield.",
      outcome: "You'll have 5 go-to coping strategies for your life.",
      lessons: [
        { title: 'Behavioral alternatives', readTime: '3 min', content: `Match the need, not the behavior:\n\nExcitement → Play football, workout\nEscape → Read, walk, meditate\nSocial → Join groups, call friends\nHope → Set real savings goals, start a side hustle`, reflection: 'Why do YOU gamble? What\'s a healthy alternative?' },
        { title: 'Cognitive reframing', readTime: '2 min', content: `Old thought: "I need to bet to enjoy football."\nReframed: "I can enjoy the match without risking money."\n\nOld thought: "I'm missing out on winning."\nReframed: "I'm missing out on LOSING."\n\nPractice: Write 3 gambling thoughts and reframe each.`, reflection: "What's ONE gambling thought you have often? Reframe it." },
        { title: 'Relaxation techniques', readTime: '3 min', content: `Box Breathing:\n1. Inhale 4s\n2. Hold 4s\n3. Exhale 4s\n4. Hold 4s\nRepeat 5x\n\n5-4-3-2-1 Grounding:\nName 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.\n\n2 minutes, anywhere, no equipment.`, reflection: 'Try box breathing right now. How do you feel?' },
      ]
    },
    {
      id: 6, title: 'Relapse Prevention', duration: '10 min', icon: '🔒',
      preview: 'Plan for high-risk situations before they happen.',
      description: 'Prepare for high-risk situations.',
      howItHelps: "A slip doesn't have to become a full return to gambling.",
      outcome: "You'll have an emergency plan for your riskiest situations.",
      lessons: [
        { title: 'High-risk situations', readTime: '3 min', content: `What puts you at highest risk?\n\n• Payday? (M-Pesa high)\n• Weekend nights?\n• After arguments?\n• Watching matches alone?\n• Friends betting?\n\nKnowing your danger zones = never surprised.`, reflection: 'What are YOUR top 3 high-risk situations?' },
        { title: 'Coping cards', readTime: '3 min', content: `Create a card for each situation:\n\nSITUATION: Payday\n⚠️ RISK: I'll bet "just a little"\n🛡️ PLAN: Send savings first, pay bills, call friend, reward myself\n\nMake cards for your top 3. Read them BEFORE the risk hits.`, reflection: 'Create your first coping card now.' },
        { title: 'Emergency plans', readTime: '4 min', content: `If you slip:\n1. STOP immediately\n2. Call support person\n3. Write what happened\n4. Don't shame yourself — say "slip" not "failure"\n5. Get back to routine tomorrow\n6. Review coping cards\n\nA slip is data, not disaster.`, reflection: "What's your plan if a slip happens?" },
      ]
    },
    {
      id: 7, title: 'Building Healthy Alternatives', duration: '8 min', icon: '🌱',
      preview: 'Replace gambling with a life that\'s genuinely more fulfilling.',
      description: 'Replace gambling with meaningful activities.',
      howItHelps: 'Nature abhors a vacuum. Fill gambling\'s space with something better.',
      outcome: "You'll have a personal growth plan that excites you.",
      lessons: [
        { title: 'Value identification', readTime: '3 min', content: `What matters to YOU?\n\n• What did you love before gambling?\n• What would you do if money wasn't a concern?\n• Who do you want to be in 5 years?\n\nYour values are your compass. Recovery brings you closer to them.`, reflection: 'What are your top 3 values? Are your actions aligned?' },
        { title: 'Goal-setting', readTime: '3 min', content: `Instead of "stop gambling," try:\n• Save KES 50,000 by December\n• Buy land in 2 years\n• Start a business\n• Take family on holiday\n\nKES 500/week saved = KES 26,000/year. What could you do with that?`, reflection: "What's ONE exciting goal for the money you save?" },
        { title: 'Life balance', readTime: '2 min', content: `Rate yourself 1-10 on:\n🏋️ Health | 🧠 Growth | 👥 Social | 💼 Work | 😴 Rest | 🎨 Fun\n\nWhere are you lowest? What's ONE small action this week?\n\nRecovery isn't just stopping gambling — it's building a life you don't want to escape from.`, reflection: 'Which area needs the most attention? Take one action this week.' },
      ]
    },
    {
      id: 8, title: 'Long-Term Maintenance & Helping Others', duration: '9 min', icon: '🏆',
      preview: 'Lock in your progress and help others on their journey.',
      description: 'Sustain your progress and help others.',
      howItHelps: 'The best way to keep recovery strong is helping someone else.',
      outcome: "You'll have a maintenance plan and peer support option.",
      lessons: [
        { title: 'Early warning signs', readTime: '3 min', content: `Even after months clean, watch for:\n\n• Romanticizing past gambling\n• "Testing" yourself\n• Life stress building up\n• Isolating from support\n• Skipping diary entries\n• Thinking "I'm cured"\n\nCreate a monthly maintenance checklist.`, reflection: 'Create your monthly checklist. When will you review it?' },
        { title: 'Booster sessions', readTime: '3 min', content: `Schedule regular check-ins:\n• Monthly: Review progress and triggers\n• Quarterly: Re-read favorite lessons\n• Annually: Celebrate your anniversary\n\nTreat these like important appointments.`, reflection: 'Schedule your first monthly booster now.' },
        { title: 'Helping others', readTime: '3 min', content: `Your experience is VALUABLE.\n\nConsider:\n• Sharing your story (anonymously if preferred)\n• Being a buddy for someone starting out\n• Writing tips for the community\n\nHelping others reinforces your own recovery.\n\n"Your mess becomes your message."`, reflection: 'Would you consider helping others? Even once can change a life.' },
      ]
    },
  ]

  useEffect(() => { fetchProgress() }, [])

  const fetchProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      const { data, error } = await supabase.from('cbt_progress').select('module_id').eq('user_id', session.user.id).eq('completed', true)
      if (error) throw error
      setCompletedIds((data || []).map(d => d.module_id))
    } catch (err) {
      console.error('Failed to fetch progress:', err)
    }
  }

  // ✅ Auto-expand first incomplete module
  useEffect(() => {
    if (completedIds.length < modules.length) {
      const firstIncomplete = modules.find(m => !completedIds.includes(m.id))
      if (firstIncomplete && !activeModule) setActiveModule(firstIncomplete.id)
    }
  }, [completedIds, activeModule])

  const handleComplete = async (moduleId, moduleTitle) => {
    if (!userId || completedIds.includes(moduleId) || saving) return

    // ✅ Gate: Must have viewed at least one lesson from this module
    const hasViewedLesson = activeLesson && activeLesson.moduleId === moduleId
    if (!hasViewedLesson) {
      showToast('📖 Please view at least one lesson before completing.', 2000)
      return
    }

    setSaving(true)
    const { error } = await supabase.from('cbt_progress').upsert(
      { user_id: userId, module_id: moduleId, completed: true, completed_at: new Date().toISOString() },
      { onConflict: 'user_id,module_id' }
    )

    if (error) {
      console.error('Failed to save progress:', error)
      showToast('❌ Failed to save. Please try again.', 3000)
      setSaving(false)
      return
    }

    setSaving(false)
    setCompletedIds(prev => [...prev, moduleId])
    setCelebratingModule(moduleTitle)
    setShowCelebration(true)

    // ✅ Respect reduced motion
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      triggerConfetti()
    }

    showToast(`🎉 Module completed! Great work!`, 3000)

    const newCount = completedIds.length + 1
    if (newCount === 8) setBadgeEarned({ emoji: '🧠', name: 'CBT Master', color: '#3db88a' })
    else if (newCount === 5) setBadgeEarned({ emoji: '💪', name: 'Dedicated Learner', color: '#f59e0b' })
    else if (newCount === 3) setBadgeEarned({ emoji: '📚', name: 'Active Learner', color: '#FAC775' })
    else if (newCount === 1) setBadgeEarned({ emoji: '🌱', name: 'Getting Started', color: '#6ee7b7' })

    // ✅ Error-handled badge check
    try {
      const { checkBadges } = await import('../../lib/gamification')
      const newBadges = await checkBadges(userId)
      if (newBadges?.length > 0) newBadges.forEach(b => showToast(`${b.emoji} ${b.name} badge earned!`, 4000))
    } catch (err) {
      console.error('Badge check failed:', err)
    }

    celebrationTimer.current = setTimeout(() => { setShowCelebration(false); setBadgeEarned(null) }, 3000)
  }

  const completedCount = completedIds.length
  const allCompleted = completedCount === modules.length

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">

        {/* Celebration overlay — dismissable with aria */}
        {showCelebration && (
          <div
            onClick={() => { setShowCelebration(false); setBadgeEarned(null) }}
            role="dialog"
            aria-modal="true"
            aria-label="Module completed"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <div style={{ fontSize: '60px', animation: 'checkmarkPop 0.5s ease-out' }}>🎉</div>
            <h2 style={{ color: '#f59e0b', fontFamily: "'Playfair Display', serif", marginTop: '16px' }}>Module Complete!</h2>
            <p style={{ color: '#6ee7b7', fontSize: '14px', marginTop: '8px' }}>{celebratingModule}</p>
            {badgeEarned && (
              <div style={{ marginTop: '16px', background: '#0a3d22', padding: '12px 24px', borderRadius: '12px', border: `2px solid ${badgeEarned.color}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>{badgeEarned.emoji}</span>
                <span style={{ color: badgeEarned.color, fontSize: '16px', fontWeight: 600 }}>{badgeEarned.name} Badge!</span>
              </div>
            )}
            <p style={{ color: '#3b7a5a', fontSize: '11px', marginTop: '20px' }}>Tap anywhere to dismiss</p>
          </div>
        )}

        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#041f13', borderBottom: '1px solid #0a3d22', position: 'sticky', top: 0, zIndex: 100 }}>
          <div><h1 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', fontFamily: "'Inter', sans-serif", margin: 0 }}>🧠 CBT Modules</h1><p style={{ fontSize: '12px', color: '#3b7a5a', margin: '2px 0 0' }}>{allCompleted ? 'All complete! 🎉' : `${completedCount} of ${modules.length} completed`}</p></div>
          <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: 600 }}>{Math.round((completedCount / modules.length) * 100)}%</span>
        </nav>

        <div style={{ padding: '1.5rem' }}>
          <div className="dash-section" style={{ marginBottom: '1rem' }}><div className="progress-bar-wrap"><div className="progress-bar"><div className="progress-fill" style={{ width: `${(completedCount / modules.length) * 100}%`, transition: 'width 0.8s ease' }} /></div><span className="progress-label">{Math.round((completedCount / modules.length) * 100)}%</span></div></div>

          {allCompleted && (
            <div className="dash-section" style={{ marginBottom: '1rem', textAlign: 'center', borderColor: '#f59e0b', background: '#0a3d22' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏆</div>
              <h3 style={{ color: '#f59e0b', fontSize: '16px', marginBottom: '8px' }}>You've completed all modules!</h3>
              <p style={{ color: '#6ee7b7', fontSize: '13px', lineHeight: '1.6' }}>Amazing work! Revisit any module to refresh your knowledge.</p>
            </div>
          )}

          <div className="modules-list">
            {modules.map(m => {
              const completed = completedIds.includes(m.id)
              const isActive = activeModule === m.id
              const isLessonActive = activeLesson?.moduleId === m.id
              return (
                <div key={m.id}>
                  <div className={`module-card ${completed ? 'module-done' : ''}`} style={isActive ? { borderColor: '#f59e0b' } : {}}>
                    <div
                      className="module-top"
                      onClick={() => {
                        setActiveModule(isActive ? null : m.id)
                        // ✅ Reset lesson when switching modules
                        if (activeLesson?.moduleId !== m.id) setActiveLesson(null)
                      }}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isActive}
                      aria-label={`${m.title} — ${completed ? 'Completed' : `${m.duration}, ${m.lessons.length} lessons`}`}
                      onKeyDown={e => { if (e.key === 'Enter') { setActiveModule(isActive ? null : m.id); if (activeLesson?.moduleId !== m.id) setActiveLesson(null) } }}
                    >
                      <div className="module-icon">{m.icon}</div>
                      <div className="module-info">
                        <div className="module-title-row"><h3 className="module-title">{m.title}</h3>{completed && <span className="badge-done">✅ Done</span>}</div>
                        <p className="module-meta">{m.duration} · {m.lessons.length} lessons</p>
                        <p className="module-desc">{completed ? m.description : m.preview}</p>
                      </div>
                      <span style={{ color: '#3b7a5a', fontSize: '18px', transition: 'transform 0.2s', transform: isActive ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                    </div>

                    {isActive && !isLessonActive && (
                      <div className="module-expanded" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                          <div style={{ background: '#041f13', padding: '12px', borderRadius: '8px' }}><p style={{ fontSize: '11px', color: '#3b7a5a', marginBottom: '4px', textTransform: 'uppercase' }}>How this helps</p><p style={{ fontSize: '12px', color: '#9fe1cb', lineHeight: '1.5', margin: 0 }}>{m.howItHelps}</p></div>
                          <div style={{ background: '#041f13', padding: '12px', borderRadius: '8px' }}><p style={{ fontSize: '11px', color: '#3b7a5a', marginBottom: '4px', textTransform: 'uppercase' }}>After this module</p><p style={{ fontSize: '12px', color: '#9fe1cb', lineHeight: '1.5', margin: 0 }}>{m.outcome}</p></div>
                        </div>
                        <div className="lessons-list">{m.lessons.map((l, i) => (
                          <div key={i} className="lesson-item" style={{ cursor: 'pointer', padding: '10px', borderRadius: '8px' }}
                            onClick={() => setActiveLesson({ moduleId: m.id, lessonIndex: i })}
                            onMouseEnter={e => e.currentTarget.style.background = '#041f13'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            role="button" tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter') setActiveLesson({ moduleId: m.id, lessonIndex: i }) }}
                          >
                            <span className="lesson-num">{i + 1}</span><div style={{ flex: 1 }}><span className="lesson-text">{l.title}</span><span style={{ fontSize: '11px', color: '#3b7a5a', display: 'block' }}>{l.readTime}</span></div><span style={{ color: '#3b7a5a' }}>→</span>
                          </div>
                        ))}</div>
                        {!completed && (
                          <button className="btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => handleComplete(m.id, m.title)} disabled={saving}>
                            {saving ? <span className="spinner"></span> : 'Mark module as complete'}
                          </button>
                        )}
                        {completed && <p style={{ color: '#6ee7b7', fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>✅ Completed — you can still review lessons</p>}
                      </div>
                    )}

                    {isLessonActive && (
                      <div className="module-expanded" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        <button onClick={() => setActiveLesson(null)} style={{ background: 'transparent', border: 'none', color: '#6ee7b7', fontSize: '13px', cursor: 'pointer' }}>← Back</button>
                        <div style={{ background: '#041f13', borderRadius: '12px', padding: '20px', border: '1px solid #0a3d22', margin: '12px 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><span style={{ fontSize: '11px', color: '#f59e0b' }}>Lesson {activeLesson.lessonIndex + 1}/{m.lessons.length}</span><span style={{ fontSize: '11px', color: '#3b7a5a' }}>{m.lessons[activeLesson.lessonIndex].readTime}</span></div>
                          <h3 style={{ color: '#e2f5ec', fontSize: '16px', marginBottom: '16px', fontFamily: "'Playfair Display', serif" }}>{m.lessons[activeLesson.lessonIndex].title}</h3>
                          <div style={{ color: '#9fe1cb', fontSize: '13px', lineHeight: '1.8', fontWeight: 300, whiteSpace: 'pre-line' }}>{m.lessons[activeLesson.lessonIndex].content}</div>
                          <div style={{ marginTop: '20px', padding: '14px', background: '#0a3d22', borderRadius: '8px', border: '1px dashed #1d5c38' }}><p style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '6px' }}>💭 Reflection</p><p style={{ fontSize: '13px', color: '#6ee7b7', lineHeight: '1.6', fontStyle: 'italic', margin: 0 }}>{m.lessons[activeLesson.lessonIndex].reflection}</p></div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {activeLesson.lessonIndex > 0 && <button onClick={() => setActiveLesson({ moduleId: m.id, lessonIndex: activeLesson.lessonIndex - 1 })} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid #0a3d22', color: '#6ee7b7', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>← Previous</button>}
                          {activeLesson.lessonIndex < m.lessons.length - 1 ? (
                            <button onClick={() => setActiveLesson({ moduleId: m.id, lessonIndex: activeLesson.lessonIndex + 1 })} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#0a3d22', border: '1px solid #1d5c38', color: '#6ee7b7', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Next →</button>
                          ) : (
                            <button onClick={() => { setActiveLesson(null); if (!completed) handleComplete(m.id, m.title) }} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: completed ? '#0a3d22' : '#f59e0b', border: 'none', color: completed ? '#6ee7b7' : '#041f13', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{completed ? '✅ Complete' : 'Complete ✅'}</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes checkmarkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes confettiFall { 0%{transform:translateY(-100%) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
        @keyframes badgeUnlock { 0%{transform:scale(0) rotate(-180deg);opacity:0} 60%{transform:scale(1.2) rotate(10deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default CBTModules
