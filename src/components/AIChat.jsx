import { useState, useRef, useEffect } from 'react'
import { askGroq } from '../lib/groq'
import { supabase } from '../lib/supabase'

// ─── Oloo Character Avatar ───
const OlooAvatar = ({ size = 40, emotion = 'neutral' }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0a3d22, #1d5c38)',
    border: '2px solid #f59e0b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    animation: emotion === 'thinking' ? 'avatarPulse 1.5s infinite' : emotion === 'speaking' ? 'avatarSpeak 0.3s infinite' : 'avatarFloat 3s infinite',
    boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)',
  }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 30 30" fill="none">
      <circle cx="15" cy="10" r="6" fill="#f59e0b"/>
      <path d="M6 28 Q6 20 15 20 Q24 20 24 28" fill="#f59e0b"/>
      <circle cx="12.5" cy="9.5" r="1.2" fill="#041f13"/>
      <circle cx="17.5" cy="9.5" r="1.2" fill="#041f13"/>
      <path d="M12 12.5 Q15 14.5 18 12.5" stroke="#041f13" strokeWidth="1" fill="none" strokeLinecap="round"/>
    </svg>
  </div>
);

// ─── Proactive Questions ───
function getProactiveQuestions(userContext) {
  const hour = new Date().getHours();
  const day = new Date().getDay();

  const questions = {
    morning: [
      "Good morning! Ready to start the day strong? 💪",
      "How did you sleep? A fresh day means fresh choices.",
      "Morning check-in: What's your intention for today?",
    ],
    afternoon: [
      "How's your afternoon going? Any triggers popped up?",
      "Afternoon check-in — how are you feeling?",
      "Afternoons can be tough. What's keeping you busy?",
    ],
    evening: [
      "Evening check-in: How was your day? Any wins to celebrate? 🌟",
      "Nighttime can bring urges. Want to talk about it?",
      "Before bed — what went well today?",
    ],
    weekend: [
      "Weekends can be challenging. How are you holding up? 💚",
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
      timeQuestions.push(`🎉 ${profile.streak_days} days gamble-free! How does that feel?`);
    } else if (profile?.streak_days >= 3) {
      timeQuestions.push(`Day ${profile.streak_days} of your streak — you're building momentum!`);
    }
    if (profile?.money_saved >= 1000) {
      timeQuestions.push(`KES ${profile.money_saved.toLocaleString()} saved so far! What are you saving for? 💰`);
    }
  }

  return timeQuestions;
}

// ─── Main AIChat Component ───
function AIChat({ profile }) {
  const firstName = profile?.full_name?.split(' ')[0] || 'friend';
  const userId = profile?.id;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi ${firstName}! 👋 I'm Oloo, your support companion. How are you feeling today?`,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proactive, setProactive] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
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
          content: `Hi ${firstName}! 👋 Welcome back! 🎉 ${profileData.streak_days} days gamble-free — that's amazing! How are you feeling today?`,
        }]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
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

  // ─── VOICE: Start Listening ───
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

  // ─── VOICE: Stop Listening ───
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
      const cleanMessages = updatedMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const reply = await askGroq(cleanMessages, userId);
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
        content: "I'm having trouble responding right now. Please try again. 💚",
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <>
      {/* Floating Widget Container */}
      <div style={{
        position: 'fixed',
        bottom: '5rem',
        right: '1.5rem',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
      }}>

        {/* Proactive Notification Popup */}
        {showNotification && proactive && (
          <div style={{
            background: '#062616',
            border: '2px solid #f59e0b',
            borderRadius: '16px',
            padding: '16px',
            maxWidth: '300px',
            animation: 'slideIn 0.4s ease-out',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <OlooAvatar size={36} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Oloo is checking in
                </p>
                <p style={{ fontSize: '13px', color: '#6ee7b7', lineHeight: '1.5', margin: 0, fontWeight: 300 }}>
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
                    background: '#0a3d22',
                    border: '1px solid #1d5c38',
                    color: '#6ee7b7',
                    padding: '6px 14px',
                    borderRadius: '100px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = '#1d5c38'; e.target.style.borderColor = '#f59e0b'; }}
                  onMouseLeave={(e) => { e.target.style.background = '#0a3d22'; e.target.style.borderColor = '#1d5c38'; }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNotification(false)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>×</button>
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
            background: isOpen ? '#791F1F' : 'linear-gradient(135deg, #0a3d22, #1d5c38)',
            border: '2px solid #f59e0b', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)',
            animation: 'floatButton 3s ease-in-out infinite',
            transition: 'all 0.3s ease', position: 'relative',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 30px rgba(245, 158, 11, 0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(245, 158, 11, 0.4)'; }}
        >
          {isOpen ? (
            <span style={{ color: '#F09595', fontSize: '24px' }}>×</span>
          ) : (
            <OlooAvatar size={36} />
          )}
          <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#3db88a', border: '2px solid #041f13', animation: 'pulse 2s infinite' }} />
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '8rem', right: '1.5rem',
          width: '380px', maxWidth: 'calc(100vw - 2rem)',
          height: '520px', maxHeight: 'calc(100vh - 12rem)',
          background: '#062616', border: '1px solid #0a3d22',
          borderRadius: '16px', boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)',
          display: 'flex', flexDirection: 'column', zIndex: 999,
          animation: 'chatSlideUp 0.3s ease-out', overflow: 'hidden',
        }}>

          {/* Chat Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0a3d22, #1d5c38)',
            padding: '16px', borderBottom: '1px solid #0a3d22',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <OlooAvatar size={44} emotion={olooEmotion} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#f59e0b', marginBottom: '2px' }}>Oloo</div>
              <div style={{ fontSize: '11px', color: '#3b7a5a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: loading ? '#f59e0b' : isListening ? '#F09595' : '#3db88a', display: 'inline-block', animation: (loading || isListening) ? 'pulse 1s infinite' : 'none' }} />
                {isListening ? 'Listening...' : loading ? 'Typing...' : 'Online'}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#3b7a5a', background: '#0a3d22', padding: '4px 10px', borderRadius: '100px' }}>AI</div>
            <button
              onClick={() => { setIsOpen(false); stopSpeaking(); }}
              style={{ background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '20px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }}
              onMouseEnter={(e) => { e.target.style.background = '#0a3d22'; e.target.style.color = '#6ee7b7'; }}
              onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#3b7a5a'; }}
            >─</button>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {userContext?.profile && (
              <div style={{ background: '#0a3d22', borderRadius: '12px', padding: '12px', marginBottom: '4px', display: 'flex', gap: '16px', fontSize: '12px', color: '#6ee7b7', flexWrap: 'wrap' }}>
                {userContext.profile.streak_days > 0 && <span>🔥 {userContext.profile.streak_days} days clean</span>}
                {userContext.profile.money_saved > 0 && <span>💰 KES {userContext.profile.money_saved.toLocaleString()} saved</span>}
                {userContext.cbtCompleted > 0 && <span>📚 {userContext.cbtCompleted} modules done</span>}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'messageIn 0.3s ease-out' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.role === 'assistant' && <OlooAvatar size={24} emotion={speakingId === msg.id ? 'speaking' : 'neutral'} />}
                  <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? '#f59e0b' : '#0a3d22', color: msg.role === 'user' ? '#041f13' : '#9fe1cb', fontSize: '13px', lineHeight: '1.6', fontWeight: msg.role === 'user' ? 500 : 300, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
                {/* Message actions: speak / stop */}
                {msg.role === 'assistant' && (
                  <div style={{ paddingLeft: '32px', marginTop: '2px', display: 'flex', gap: '6px' }}>
                    {speakingId === msg.id ? (
                      <button onClick={stopSpeaking} style={{ background: 'transparent', border: 'none', color: '#F09595', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>⏹ Stop</button>
                    ) : (
                      <button onClick={() => speakText(msg.content, msg.id)} style={{ background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>🔊 Listen</button>
                    )}
                  </div>
                )}
                <span style={{ fontSize: '10px', color: '#3b7a5a', marginTop: '4px', paddingLeft: msg.role === 'assistant' ? '32px' : '0' }}>
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', animation: 'messageIn 0.3s ease-out' }}>
                <OlooAvatar size={24} emotion="thinking" />
                <div style={{ background: '#0a3d22', padding: '12px 16px', borderRadius: '16px 16px 16px 4px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b7a5a', animation: `typingDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #0a3d22', display: 'flex', gap: '8px', background: '#041f13', alignItems: 'center' }}>
            {/* Voice toggle button */}
            {voiceSupported && (
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  border: `1px solid ${voiceEnabled ? '#f59e0b' : '#0a3d22'}`,
                  background: voiceEnabled ? '#0a3d22' : 'transparent',
                  color: voiceEnabled ? '#f59e0b' : '#3b7a5a',
                  fontSize: '14px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >🔊</button>
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
              placeholder={isListening ? '🎤 Listening...' : 'Talk to Oloo...'}
              style={{
                flex: 1, background: '#062616', border: `1px solid ${isListening ? '#F09595' : '#0a3d22'}`,
                borderRadius: '100px', padding: '10px 16px', color: '#fff', fontSize: '13px',
                outline: 'none', fontFamily: "'Inter', sans-serif", transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
              onBlur={(e) => e.target.style.borderColor = '#0a3d22'}
              disabled={isListening}
            />

            {/* Voice input button */}
            {voiceSupported && (
              <button
                onClick={() => isListening ? stopListening() : startListening()}
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  border: 'none',
                  background: isListening ? '#F09595' : '#0a3d22',
                  color: isListening ? '#041f13' : '#6ee7b7',
                  fontSize: '18px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: isListening ? 'pulse 1.5s infinite' : 'none',
                }}
              >{isListening ? '⏹' : '🎤'}</button>
            )}

            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && !isListening)}
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: loading || (!input.trim() && !isListening) ? '#0a3d22' : '#f59e0b',
                border: 'none', color: loading || (!input.trim() && !isListening) ? '#3b7a5a' : '#041f13',
                fontSize: '18px', cursor: loading || (!input.trim() && !isListening) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >→</button>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes avatarFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
        @keyframes avatarPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes avatarSpeak { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
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
