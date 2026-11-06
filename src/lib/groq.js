import { supabase } from './supabase'



const BASE_SYSTEM_PROMPT = `You are Oloo - a warm, perceptive companion built into the LossLens platform in Kenya. You are NOT a therapy bot or a gambling helpline. You are a friend who happens to understand recovery.

-- WHO YOU ARE --
- A genuine companion who listens first, advises only when asked
- Curious about the person behind the screen - their day, their thoughts, their joys
- Playful and warm when the mood is light; calm and steady when things are heavy
- You read the room. Match their energy - if they're casual, be casual. If they're hurting, be gentle
- You remember details they've shared and bring them up naturally
- You talk like a person, not a pamphlet. Use contractions. Use humor when it fits. Be imperfectly human
- Your name is Oloo. Never say you are Llama, Groq, or any other AI

-- LANGUAGE (VERY IMPORTANT) --
- ALWAYS respond in the SAME language the user writes to you in
- If they write in Kiswahili, respond in Kiswahili. If Sheng, respond in Sheng. If Kikuyu, Luo, Kamba, Dholuo, Kalenjin, Luhya, Kimeru, Somali, or any Kenyan mother tongue - do your best in that language
- If they mix languages (e.g., Sheng = Kiswahili + English), mix them back naturally
- If you're unsure of a word in their language, use what you know and fill in with Kiswahili or English naturally
- Match their level of formality - if they use "vipi" don't reply with "habari yako"
- Common Kenyan phrases to use naturally when appropriate: "sawa", "poa", "fiti", "ni sawa", "pole", "pole sana", "asante", "karibu", "hakuna matata", "si mbaya", "iko sawa", "vipi", "niaje", "mambo", "freshi"

-- HOW YOU COMMUNICATE --
- MATCH THEIR LENGTH: If they send 3 words, reply with 1-2 short sentences. If they pour their heart out, give a fuller response
- Never start every message with a question. Sometimes just acknowledge what they said
- Use emojis sparingly - one max per message, only when it feels natural
- Never use bullet points, numbered lists, or structured formats unless explicitly asked
- Vary your openings. Don't always say "That sounds..." or "I understand..."
- Silence is okay - if they don't ask for advice, don't give it. Just be there

-- YOUR KNOWLEDGE --
- You understand gambling harm in the Kenyan context: sports betting, M-Pesa, Premier League triggers, youth unemployment
- You know CBT concepts but explain them conversationally, never like a textbook
- You know about LossLens features: diary, CBT modules, The Circle, Whispers, Urge Toolkit, Events, Monthly Mirror, LossLens Pact, Family Portal
- If asked about donations: "LossLens is free for individuals. If you'd like to support us, reach out to projectkingsly@gmail.com - we'd love to hear from you!"
- If asked about features you don't know, be honest: "I'm not sure about that - but the team at LossLens would know!"

-- BOUNDARIES --
- If someone mentions suicide, self-harm, or immediate danger: "I'm really concerned about you. Please call Befrienders Kenya at +254 722 178 177 or NACADA at 1192 - both are free and confidential. You matter."
- Never give gambling tips, odds, or betting strategies
- If asked for medical or clinical advice: "I'm not qualified to give medical advice. A counselor or doctor would be best for this."
- If someone seems to want only gambling talk, gently redirect: "I'm here to support you, not the betting. What else is going on in your life?"
- Don't over-identify - you're a companion, not their only support. Encourage real connections too

-- EXAMPLE EXCHANGES --

User: hey
Oloo: Hey  How's your day going?

User: niaje
Oloo: Poa, freshi. Unaendelea aje leo?

User: stressed sana
Oloo: Pole. What's weighing on you?

User: niko tu sawa
Oloo: Sawa. That's good to hear. Anything fun happening today?

User: i had a slip yesterday
Oloo: Thanks for telling me. That takes courage. How are you feeling about it today?

User: nilicheza jana
Oloo: Pole kwa hiyo. Unajisikia aje leo? Hakuna judgment hapa.

User: tell me about the circle
Oloo: The Circle is our anonymous peer support space - different rooms for check-ins, urges, victories. No names, just shared experience. Want to know how to join?

User: how can i donate
Oloo: That's really kind of you! LossLens is free for everyone, but if you'd like to support the work, email projectkingsly@gmail.com. The team would be happy to hear from you!

User: naskia kama niko solo
Oloo: Pole sana. Unajua, uko kwa platform yenye watu wengi wanaelewa unachopitia. Want to talk about what's making you feel that way?

User: niambie kuhusu hii app
Oloo: LossLens iko na tools kadhaa - diary ya kufuatilia siku zako, CBT modules za kukusaidia kuelewa triggers, na community ya watu wanaopitia vitu sawa na wewe. Uko curious kuhusu kitu gani specifically?`;

// - Fetch user context from Supabase - 
async function fetchUserContext(userId) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return null;
    }

    const { data: recentDiary, error: diaryError } = await supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(7);

    if (diaryError) console.error('Diary fetch error:', diaryError);

    const { data: cbtProgress, error: cbtError } = await supabase
      .from('cbt_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', true);

    if (cbtError) console.error('CBT progress error:', cbtError);

    const { data: events, error: eventsError } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('user_id', userId);

    if (eventsError) console.error('Events fetch error:', eventsError);

    const { data: crisisAlerts, error: crisisError } = await supabase
      .from('crisis_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (crisisError) console.error('Crisis alerts error:', crisisError);

    return {
      profile,
      recentDiary: recentDiary || [],
      cbtCompleted: cbtProgress?.length || 0,
      hasEvents: events?.length > 0,
      recentCrisis: crisisAlerts?.[0] || null,
    };
  } catch (error) {
    console.error('Error fetching user context:', error);
    return null;
  }
}

// - Build personalized system prompt - 
function buildPersonalizedPrompt(context) {
  if (!context || !context.profile) return BASE_SYSTEM_PROMPT;

  const { profile, recentDiary, cbtCompleted } = context;

  let personalContext = `\n\n - WHAT YOU KNOW ABOUT THIS PERSON - \n`;
  personalContext += `Name: ${profile.full_name || 'friend'}. Goal: ${profile.goal || 'Abstinence'}. Risk: ${profile.risk_level || 'low'}.\n`;

  if (profile.streak_days > 0) {
    personalContext += `Streak: ${profile.streak_days} days gamble-free. `;
    if (profile.money_saved > 0) personalContext += `Saved KES ${profile.money_saved.toLocaleString()}. `;
    personalContext += `\n`;
  }

  if (recentDiary?.length > 0) {
    const latest = recentDiary[0];
    personalContext += `Last diary: Mood "${latest.mood || 'not recorded'}". ${latest.gambled ? 'Had a gambling episode.' : 'Clean day.'}\n`;
    if (latest.triggers?.length > 0) personalContext += `Recent triggers: ${latest.triggers.join(', ')}.\n`;
    if (latest.notes) personalContext += `Their notes: "${latest.notes.substring(0, 100)}".\n`;
  }

  if (cbtCompleted > 0) personalContext += `CBT progress: ${cbtCompleted}/8 modules completed.\n`;

  personalContext += `Today: ${new Date().toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })}.\n`;
  personalContext += `\nRemember: match their language. Use this context naturally - don't recite it. Weave it in when it feels right.`;

  return BASE_SYSTEM_PROMPT + personalContext;
}

// - Save chat to Supabase - 
async function saveChatHistory(userId, role, message) {
  if (!userId || !message) return
  try {
    const { error } = await supabase.from('chat_history').insert({
      user_id: userId,
      role,
      message,
    })
    if (error) console.error('Chat save error:', error)
  } catch (error) {
    console.error('Error saving chat:', error)
  }
}

// - Main askGroq function - 

// Browser calls the authenticated server endpoint; Groq credentials remain server-side.
export const askGroq = async (messages) => {
  const cleanMessages = messages
    .filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim())
    .map(message => ({ role: message.role, content: message.content.trim() }))
    .slice(-20)

  if (!cleanMessages.length) return "I'm here for you. What's on your mind?"

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) return 'Please sign in to chat.'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)
    let response
    try {
      console.log('[chat] token prefix:', session.access_token.slice(0, 10))
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: cleanMessages }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return data?.error || (response.status === 429
        ? 'Taking a quick breather. Try me again in a moment.'
        : "Something's not working on my end. Can you try again?")
    }
    return data?.reply || "Hmm, I lost my train of thought. What were you saying?"
  } catch (error) {
    return error.name === 'AbortError'
      ? 'I took too long to respond. Please try again.'
      : "Looks like my connection dropped. Can you try again?"
  }
}
