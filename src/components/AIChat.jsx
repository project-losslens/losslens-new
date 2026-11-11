import { useState, useRef, useEffect } from 'react'
import { askGroq } from '../lib/groq'
import { supabase } from '../lib/supabase'
import AppIcon from './AppIcon'
import { detectCrisis } from '../lib/crisisDetection'
import { primaryHelpline } from '../config/helplines'
import { useI18n } from '../i18n'

// — Oloo Character: flat, hand-drawn-style SVG in brand teal/blue.
//    Expressions: calm, happy, concerned, celebrating, thinking, speaking.
const OlooCharacter = ({ size = 40, emotion = 'calm' }) => {
  const expr = ['calm', 'happy', 'concerned', 'celebrating', 'thinking', 'speaking'].includes(emotion) ? emotion : 'calm'
  const ink = '#0B1220'
  return (
    <div className="oloo-avatar" style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#171E2B',
      border: '2px solid #2DD4BF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 64 64" aria-hidden="true">
        {/* leaf sprout */}
        <path d="M32 9c0-5 4-8 8-8 0 5-3 8-8 8Z" fill="#2DD4BF" stroke="#0B7A6F" strokeWidth="1" />
        <path d="M32 9c0-4-3-7-7-7 0 4 3 7 7 7Z" fill="#7DBDEE" stroke="#1E6E8C" strokeWidth="1" />
        {/* body blob */}
        <path d="M14 57c-6-8-9-16-9-24C5 19 18 9 32 9s27 10 27 24c0 8-3 16-9 24-4 5-12 6-18 6s-14-1-18-6Z" fill="#2DD4BF" stroke="#0B7A6F" strokeWidth="1.6" />
        {/* belly */}
        <ellipse cx="32" cy="46" rx="12" ry="9" fill="#7DBDEE" opacity="0.9" />
        {/* face — gentle idle breathe + periodic blink (disabled under reduced motion) */}
        <g className="oloo-face">
          {expr === 'celebrating' ? (
            <g className="oloo-eyes" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M23 30q2.5-3.5 5 0" />
              <path d="M36 30q2.5-3.5 5 0" />
            </g>
          ) : (
            <g className="oloo-eyes" fill={ink}>
              <circle cx="25.5" cy={expr === 'thinking' ? 27 : 29} r="2.1" />
              <circle cx="38.5" cy={expr === 'thinking' ? 27 : 29} r="2.1" />
            </g>
          )}
          {expr === 'concerned' && (
            <g stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none">
              <path d="M21 24.5l5 1.6" />
              <path d="M43 24.5l-5 1.6" />
            </g>
          )}
          {expr === 'happy' && (
            <g fill="#F2C879" opacity="0.85">
              <ellipse cx="20" cy="34" rx="3.4" ry="2" />
              <ellipse cx="44" cy="34" rx="3.4" ry="2" />
            </g>
          )}
          {expr === 'celebrating' && (
            <g>
              <path d="M14 18l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6Z" fill="#F2C879" />
              <path d="M50 14l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2Z" fill="#7DBDEE" />
            </g>
          )}
          {/* mouth */}
          {expr === 'speaking' ? (
            <ellipse cx="32" cy="38" rx="4" ry="5" fill={ink} />
          ) : expr === 'happy' || expr === 'celebrating' ? (
            <path d={expr === 'celebrating' ? 'M25 34Q32 45 39 34Q32 38 25 34Z' : 'M26 34Q32 42 38 34Q32 37 26 34Z'} fill={ink} />
          ) : expr === 'concerned' ? (
            <path d="M27 39.5q5-3.5 10 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : expr === 'thinking' ? (
            <path d="M29 37.5h6" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M27 36.5q5 3 10 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
        </g>
      </svg>
    </div>
  )
}

// — Proactive Questions —
function getProactiveQuestions(userContext) {
  const hour = new Date().getHours();
  const day = new Date().getDay();

  const questions = {
    morning: [
      "Good morning! Ready to start the day strong? ",
      "How did you sleep? A fresh day means fresh choices.",
      "Morning check-in: What's your intention for today?",
    ],
    afternoon: [
      "How's your afternoon going? Any triggers popped up?",
      "Afternoon check-in — how are you feeling?",
      "Afternoons can be tough. What's keeping you busy?",
    ],
    evening: [
      "Evening check-in: How was your day? Any wins to celebrate? ",
      "Nighttime can bring urges. Want to talk about it?",
      "Before bed — what went well today?",
    ],
    weekend: [
      "Weekends can be challenging. How are you holding up? ",
      "Lots of matches today. Want to talk through any urges?",
    ],
  };

  let timeQuestions;
  if (hour >= 5 && hour < 12) timeQuestions = questions.morning;
  else if (hour >= 12 && hour < 17) timeQuestions = questions.afternoon;
  else timeQuestions = questions.evening;

  if (day === 0 || day === 6) {
    timeQuestions = [...timeQuestions, ...questions.weekend];
  }

  if (userContext) {
    const { profile } = userContext;
    if (profile?.streak_days >= 7) {
      timeQuestions.push(` ${profile.streak_days} days gamble-free! How does that feel?`);
    } else if (profile?.streak_days >= 3) {
      timeQuestions.push(`Day ${profile.streak_days} of your streak — you're building momentum!`);
    }
    if (profile?.money_saved >= 1000) {
      timeQuestions.push(`KES ${profile.money_saved.toLocaleString()} saved so far! What are you saving for? `);
    }
  }

  return timeQuestions;
}

// — Main AIChat Component —
function AIChat({ profile }) {
  const { t } = useI18n();
  const firstName = profile?.full_name?.split(' ')[0] || 'friend';
  const userId = profile?.id;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi ${firstName}!  I'm Oloo, your support companion. How are you feeling today?`,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proactive, setProactive] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [aiConsent, setAiConsent] = useState(null);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [aiConsentError, setAiConsentError] = useState('');
  const [olooEmotion, setOlooEmotion] = useState('neutral');
  const [userContext, setUserContext] = useState(null);

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  const messagesEndRef = useRef(null);
  const inactivityTimer = useRef(null);
  const proactiveQuestions = useRef(getProactiveQuestions(null));
  const inputRef = useRef(null);

  // Check voice support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) setVoiceSupported(true);
  }, []);

  // Fetch user context
  useEffect(() => {
    if (userId) fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setAiConsent(Boolean(profileData?.ai_data_consent_at));

      const { data: recentDiary } = await supabase
        .from('diary_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(7);

      const { count: cbtCompleted } = await supabase
        .from('cbt_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('completed', true);

      const userData = { profile: profileData, recentDiary: recentDiary || [], cbtCompleted: cbtCompleted || 0 };
      setUserContext(userData);
      proactiveQuestions.current = getProactiveQuestions(userData);

      if (profileData?.streak_days >= 7) {
        setMessages([{
          role: 'assistant',
          content: `Hi ${firstName}!  Welcome back!  ${profileData.streak_days} days gamble-free — that's amazing! How are you feeling today?`,
        }]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setAiConsent(false);
    }
  };

  const acceptAiConsent = async () => {
    if (!userId || aiConsentSaving) return;
    setAiConsentSaving(true);
    setAiConsentError('');
    const { error } = await supabase
      .from('profiles')
      .update({ ai_data_consent_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      console.error('AI data consent could not be saved:', error);
      setAiConsentError('Your consent could not be saved. Please try again.');
      setAiConsentSaving(false);
      return;
    }
    setAiConsent(true);
    setAiConsentSaving(false);
  };

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Proactive check-in
  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    setProactive(null);
    setShowNotification(false);
    inactivityTimer.current = setTimeout(() => {
      if (!isOpen) {
        const questions = proactiveQuestions.current;
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        setProactive(randomQuestion);
        setShowNotification(true);
      }
    }, 2 * 60 * 1000);
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      stopListening();
      stopSpeaking();
    };
  }, [messages, isOpen]);

  // — VOICE: StartListening —
  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'sw-KE';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setTimeout(() => sendMessage(transcript), 300);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // — VOICE: StopListening —
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  // ─── VOICE: Speak text aloud ───
  const speakText = (text, messageId) => {
    if (!synthRef.current) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    const hasSwahili = /[a-z].*[a-z].*[a-z]/i.test(text) && (
      text.includes('sawa') || text.includes('pole') || text.includes('niko') ||
      text.includes('uko') || text.includes('ako') || text.includes('hapa') ||
      text.includes('sana') || text.includes('kama') || text.includes('na')
    );
    utterance.lang = hasSwahili ? 'sw-KE' : 'en-KE';
    utterance.rate = 0.9;
    utterance.pitch = 1.1;

    utterance.onstart = () => {
      setSpeakingId(messageId);
      setOlooEmotion('speaking');
    };

    utterance.onend = () => {
      setSpeakingId(null);
      setOlooEmotion('neutral');
    };

    utterance.onerror = () => {
      setSpeakingId(null);
      setOlooEmotion('neutral');
    };

    synthRef.current.speak(utterance);
  };

  // ─── VOICE: Stop speaking ───
  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setSpeakingId(null);
    setOlooEmotion('neutral');
  };

  // ─── Send message ───
  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    if (aiConsent !== true) {
      setAiConsentError(aiConsent === null ? 'Checking consent status. Please try again.' : '');
      return;
    }

    stopListening();
    setProactive(null);
    setShowNotification(false);
    resetInactivityTimer();

    const userMsg = { role: 'user', content, id: Date.now().toString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setOlooEmotion('thinking');

    try {
      const reply = await askGroq(content);
      const replyId = (Date.now() + 1).toString();
      const replyMsg = { role: 'assistant', content: reply, id: replyId };

      setOlooEmotion('neutral');
      setMessages([...updatedMessages, replyMsg]);

      if (voiceEnabled) {
        setTimeout(() => speakText(reply, replyId), 200);
      }
    } catch {
      setOlooEmotion('neutral');
      setMessages([...updatedMessages, {
        role: 'assistant',
        content: "I'm having trouble responding right now. Please try again. ",
      }]);
    } finally {
      setLoading(false);
    }
  };

  //  Oloo's expression follows context: streak milestone → celebrating,
  //  high-risk day → concerned, otherwise calm/happy. thinking/speaking
  //  are transient states that override it.
  const contextExpression = (() => {
    const p = userContext?.profile;
    if (!p) return 'calm';
    const streak = p.streak_days || 0;
    const risk = String(p.risk_level || '').toLowerCase();
    const lastEntry = userContext?.recentDiary?.[0];
    const lowMood = lastEntry && (lastEntry.gambled === true || ['rough', 'bad', 'low', 'struggling', 'awful'].includes(String(lastEntry.mood || '').toLowerCase()));
    if (risk === 'high' || lowMood) return 'concerned';
    if (streak > 0 && streak % 7 === 0) return 'celebrating';
    if (streak >= 3) return 'happy';
    return 'calm';
  })();
  const shownEmotion = olooEmotion === 'thinking' ? 'thinking' : olooEmotion === 'speaking' ? 'speaking' : contextExpression;

  //  Time-aware greeting + thought for today (EN/SW via i18n keys).
  const hour = new Date().getHours();
  const greetKey = hour >= 5 && hour < 12 ? 'oloo.greet.morning' : hour >= 12 && hour < 17 ? 'oloo.greet.afternoon' : 'oloo.greet.evening';
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const thoughtKey = `oloo.thought.${dayOfYear % 5}`;
  const greetingText = t(greetKey, { name: firstName });
  const thoughtText = t(thoughtKey);
  const quickChips = ['oloo.chip.urge', 'oloo.chip.log', 'oloo.chip.talk'];

  if (!profile) return null;

  return (
    <>
      {/* Floating Widget Container */}
      <div style={{
        position: 'fixed',
        bottom: '5rem',
        right: '1.5rem',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
      }}>

        {/* Proactive Notification Popup */}
        {showNotification && proactive && (
          <div style={{
            background: '#171E2B',
            border: '2px solid #2DD4BF',
            borderRadius: '16px',
            padding: '16px',
            maxWidth: '300px',
            animation: 'slideIn 0.4s ease-out',
            boxShadow: '0 8px 32px rgba(11,18,32,0.5)',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <OlooCharacter size={36} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: '#2DD4BF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Oloo is checking in
                </p>
                <p style={{ fontSize: '13px', color: '#2DD4BF', lineHeight: '1.5', margin: 0, fontWeight: 300 }}>
                  {proactive}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {["I'm okay", "Struggling", "Had a slip", "Just browsing"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setShowNotification(false);
                    setIsOpen(true);
                    sendMessage(opt);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid #7DBDEE',
                    color: '#2DD4BF',
                    padding: '6px 14px',
                    borderRadius: '100px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = '#7DBDEE'; e.target.style.borderColor = '#2DD4BF'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.borderColor = '#7DBDEE'; }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNotification(false)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>{'\u00D7'}</button>
          </div>
        )}

        {/* Floating Oloo Button */}
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowNotification(false);
            setProactive(null);
            resetInactivityTimer();
            if (isOpen) stopSpeaking();
          }}
          style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: isOpen ? '#171E2B' : '#2DD4BF',
            border: '2px solid #2DD4BF', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(45,212,191,0.4)',
            animation: 'floatButton 3s ease-in-out infinite',
            transition: 'all 0.3s ease', position: 'relative',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 30px rgba(45,212,191,0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,212,191,0.4)'; }}
        >
          {isOpen ? (
            <span style={{ color: '#FFFFFF', fontSize: '24px' }}>{'\u00D7'}</span>
          ) : (
            <OlooCharacter size={36} />
          )}
          <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#2DD4BF', border: '2px solid #0B1220', animation: 'pulse 2s infinite' }} />
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '8rem', right: '1.5rem',
          width: '380px', maxWidth: 'calc(100vw - 2rem)',
          height: '520px', maxHeight: 'calc(100vh - 10rem)',
          background: '#171E2B', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '16px', boxShadow: '0 12px 48px rgba(11,18,32,0.5)',
          display: 'flex', flexDirection: 'column', zIndex: 'var(--z-modal)',
          animation: 'chatSlideUp 0.3s ease-out', overflow: 'hidden',
        }}>

          {/* Chat Header */}
          <div style={{
            background: '#0B1220',
            padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <OlooCharacter size={44} emotion={shownEmotion} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#2DD4BF', marginBottom: '2px' }}>Oloo</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: loading ? '#2DD4BF' : isListening ? '#FFFFFF' : '#2DD4BF', display: 'inline-block', animation: (loading || isListening) ? 'pulse 1s infinite' : 'none' }} />
                {isListening ? 'Listening...' : loading ? 'Typing...' : 'Online'}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.12)', padding: '4px 10px', borderRadius: '100px' }}>AI</div>
            <button
              onClick={() => { setIsOpen(false); stopSpeaking(); }}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '20px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.color = '#2DD4BF'; }}
              onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'rgba(255,255,255,0.4)'; }}
            aria-label="Close chat"
          ><AppIcon name="close" size={18} /></button>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {aiConsent !== true ? (
              <div role="dialog" aria-labelledby="ai-consent-title" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '16px', color: '#FFFFFF' }}>
                <h3 id="ai-consent-title" style={{ fontSize: '14px', color: '#2DD4BF', marginBottom: '8px' }}>Before you chat with Oloo</h3>
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)' }}>Your messages will be saved in your chat history and sent to our AI provider to generate responses. Oloo is not a substitute for professional care.</p>
                {aiConsentError && <p role="alert" style={{ fontSize: '12px', color: '#ff9b9b' }}>{aiConsentError}</p>}
                <button className="btn-primary full" type="button" onClick={acceptAiConsent} disabled={aiConsentSaving || aiConsent === null} style={{ marginTop: '12px' }}>
                  {aiConsentSaving ? 'Saving...' : aiConsent === null ? 'Checking...' : 'I agree and continue'}
                </button>
              </div>
            ) : (
            <>
            {userContext?.profile && (
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px', marginBottom: '4px', display: 'flex', gap: '16px', fontSize: '12px', color: '#2DD4BF', flexWrap: 'wrap' }}>
                {userContext.profile.streak_days > 0 && <span> {userContext.profile.streak_days} days clean</span>}
                {userContext.profile.money_saved > 0 && <span> KES {userContext.profile.money_saved.toLocaleString()} saved</span>}
                {userContext.cbtCompleted > 0 && <span> {userContext.cbtCompleted} modules done</span>}
              </div>
            )}

            {messages.length === 1 && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '14px', padding: '14px' }}>
                <p style={{ fontSize: '14px', color: '#2DD4BF', fontWeight: 600, margin: '0 0 6px' }}>{greetingText}</p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.5', margin: '0 0 12px', fontStyle: 'italic' }}>{thoughtText}</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {quickChips.map(key => (
                    <button key={key} type="button" onClick={() => sendMessage(t(key))} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid #7DBDEE', color: '#2DD4BF', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', minHeight: '36px' }}>{t(key)}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'messageIn 0.3s ease-out' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.role === 'assistant' && <OlooCharacter size={24} emotion={speakingId === msg.id ? 'speaking' : 'calm'} />}
                  <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? '#2DD4BF' : 'rgba(255,255,255,0.12)', color: msg.role === 'user' ? '#0B1220' : '#FFFFFF', fontSize: '13px', lineHeight: '1.6', fontWeight: msg.role === 'user' ? 500 : 300, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
                {/* Message actions: speak / stop */}
                {msg.role === 'assistant' && (
                  <div style={{ paddingLeft: '32px', marginTop: '2px', display: 'flex', gap: '6px' }}>
                    {speakingId === msg.id ? (
                      <button onClick={stopSpeaking} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Stop</button>
                    ) : (
                      <button onClick={() => speakText(msg.content, msg.id)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Listen</button>
                    )}
                    {detectCrisis(msg.content).crisis && (
                      <a href={`tel:${primaryHelpline.tel || primaryHelpline.phone.replace(/\s/g, '')}`} style={{ fontSize: '10px', color: '#ff9b9b', textDecoration: 'none', fontWeight: 600 }}>{t('oloo.needHelp', { name: primaryHelpline.name })}</a>
                    )}
                  </div>
                )}
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', paddingLeft: msg.role === 'assistant' ? '32px' : '0' }}>
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', animation: 'messageIn 0.3s ease-out' }}>
                <OlooCharacter size={24} emotion="thinking" />
                <div style={{ background: 'rgba(255,255,255,0.12)', padding: '12px 16px', borderRadius: '16px 16px 16px 4px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', animation: `typingDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', gap: '8px', background: '#0B1220', alignItems: 'center' }}>
            {/* Voice toggle button */}
            {voiceSupported && (
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                disabled={aiConsent !== true}
                title={voiceEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  border: `1px solid ${voiceEnabled ? '#2DD4BF' : 'rgba(255,255,255,0.12)'}`,
                  background: voiceEnabled ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: voiceEnabled ? '#2DD4BF' : 'rgba(255,255,255,0.4)',
                  fontSize: '14px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label={voiceEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
              ><AppIcon name="volume" size={16} /></button>
            )}

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Talk to Oloo...'}
              style={{
                flex: 1, background: '#171E2B', border: `1px solid ${isListening ? '#FFFFFF' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '100px', padding: '10px 16px', color: '#FFFFFF', fontSize: '13px',
                outline: 'none', fontFamily: 'var(--font-body)', transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#2DD4BF'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              disabled={isListening || aiConsent !== true}
            />

            {/* Voice input button */}
            {voiceSupported && (
              <button
                onClick={() => isListening ? stopListening() : startListening()}
                disabled={aiConsent !== true}
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  border: 'none',
                  background: isListening ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                  color: isListening ? '#0B1220' : '#2DD4BF',
                  fontSize: '18px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: isListening ? 'pulse 1.5s infinite' : 'none',
                }}
                aria-label={isListening ? 'Stop listening' : 'Voice input'}
              ><AppIcon name={isListening ? 'close' : 'mic'} size={18} /></button>
            )}

            <button
              onClick={() => sendMessage()}
              disabled={aiConsent !== true || loading || (!input.trim() && !isListening)}
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: loading || (!input.trim() && !isListening) ? 'rgba(255,255,255,0.12)' : '#2DD4BF',
                border: 'none', color: loading || (!input.trim() && !isListening) ? 'rgba(255,255,255,0.4)' : '#0B1220',
                fontSize: '18px', cursor: loading || (!input.trim() && !isListening) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.2s',
              }}
              aria-label="Send message"
            ><AppIcon name="send" size={18} /></button>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @media (max-width: 479px) {
          .oloo-chat-panel { right: 1rem !important; bottom: 6rem !important; width: calc(100vw - 2rem) !important; max-height: calc(100vh - 10rem) !important; }
        }
        .oloo-face { transform-origin: 32px 34px; animation: olooBreathe 4.5s ease-in-out infinite; }
        .oloo-eyes { transform-box: fill-box; transform-origin: center; animation: olooBlink 5s infinite; }
        @keyframes olooBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes olooBlink { 0%, 91%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.08); } }
        @media (prefers-reduced-motion: reduce) { .oloo-face, .oloo-eyes { animation: none !important; } }
        @keyframes floatButton { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes chatSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes messageIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes typingDot { 0%, 100% { transform: translateY(0); opacity: 0.3; } 50% { transform: translateY(-5px); opacity: 1; } }
      `}</style>
    </>
  );
}

export default AIChat;
