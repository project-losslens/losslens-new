import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

const MAX_SUPPORTERS = 5
const ALL_PERMISSIONS = [
  'Streak status', 'Goal progress', 'General mood',
  'Module progress', 'Event attendance', 'Diary summary', 'Risk level'
]

const SUPPORTER_RESOURCES = [
  { title: 'How to Help Without Enabling', content: 'Listen without judgment. Ask open questions like "How are you feeling?" rather than "Did you gamble?" Celebrate small wins. Avoid lecturing or giving ultimatums.' },
  { title: 'Warning Signs of Relapse', content: 'Watch for: increased secrecy about money, changes in sleep patterns, avoiding check-ins, mood swings, increased talk about betting or matches.' },
  { title: 'Communication Tips', content: 'DO say: "I\'m here for you." "How can I support you today?" "I\'m proud of you for showing up." DON\'T say: "Just stop." "You\'re throwing money away." "I\'m disappointed."' },
  { title: 'Taking Care of Yourself', content: 'Supporting someone in recovery can be emotionally draining. Set healthy boundaries. Take breaks when needed. Consider talking to a counselor yourself. Your wellbeing matters too.' },
]

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

function FamilyPortalPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('supporters')
  const [selectedInvitation, setSelectedInvitation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [feedbackGiven, setFeedbackGiven] = useState({})

  const [form, setForm] = useState({
    supporter_name: '', supporter_email: '', supporter_phone: '',
    supporter_relation: '', permissions: ['Streak status', 'Goal progress', 'General mood'],
    anonymous_mode: false, crisis_contact: false, language: 'en'
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUserId(session.user.id)
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(profileData)
    const { data: invs } = await supabase.from('supporter_invitations').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
    setInvitations(invs || [])
    setLoading(false)
  }

  const togglePermission = (perm) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }))
  }

  const handleInvite = async () => {
    if (!form.supporter_name.trim()) { showToast('Please enter a name'); return }
    if (invitations.filter(i => i.status === 'active' || i.status === 'pending').length >= MAX_SUPPORTERS) {
      showToast(`Maximum ${MAX_SUPPORTERS} supporters allowed`); return
    }

    setSaving(true)
    const { data, error } = await supabase.from('supporter_invitations').insert({
      user_id: userId, ...form, status: 'pending'
    }).select().single()

    if (!error && data) {
      setInvitations(prev => [data, ...prev])
      setShowForm(false)
      setForm({ supporter_name: '', supporter_email: '', supporter_phone: '', supporter_relation: '', permissions: ['Streak status', 'Goal progress', 'General mood'], anonymous_mode: false, crisis_contact: false, language: 'en' })
      showToast(' Invitation created! Share the link with them.', 3000)
    } else {
      showToast('Failed to create invitation. Try again.', 3000)
    }
    setSaving(false)
  }

  const handleResend = async (inv) => {
    await supabase.from('supporter_invitations').update({
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending', responded_at: null
    }).eq('id', inv.id)
    showToast(' Invitation renewed! Share the link again.', 3000)
    fetchData()
  }

  const handleRemove = async (invId) => {
    if (!confirm('Remove this supporter?')) return
    await supabase.from('supporter_invitations').delete().eq('id', invId)
    setInvitations(prev => prev.filter(i => i.id !== invId))
    showToast('Removed.', 2000)
  }

  const handleTogglePause = async (inv) => {
    const newStatus = inv.status === 'paused' ? 'active' : 'paused'
    await supabase.from('supporter_invitations').update({ status: newStatus }).eq('id', inv.id)
    setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, status: newStatus } : i))
    showToast(newStatus === 'paused' ? 'â¸ Paused' : 'Ã¢â€“Â¶Ã¯Â¸Â Resumed', 2000)
  }

  const handleToggleCrisis = async (inv) => {
    await supabase.from('supporter_invitations').update({ crisis_contact: !inv.crisis_contact }).eq('id', inv.id)
    setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, crisis_contact: !i.crisis_contact } : i))
  }

  const loadMessages = async (inv) => {
    setSelectedInvitation(inv)
    const { data } = await supabase.from('supporter_messages').select('*').eq('invitation_id', inv.id).order('created_at', { ascending: true })
    setMessages(data || [])
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedInvitation) return
    await supabase.from('supporter_messages').insert({ invitation_id: selectedInvitation.id, sender: 'user', content: messageInput.trim() })
    setMessages(prev => [...prev, { id: Date.now().toString(), invitation_id: selectedInvitation.id, sender: 'user', content: messageInput.trim(), created_at: new Date().toISOString() }])
    setMessageInput('')
  }

  const giveFeedback = async (invId, felt) => {
    await supabase.from('supporter_feedback').insert({ user_id: userId, invitation_id: invId, felt_supported: felt })
    setFeedbackGiven(prev => ({ ...prev, [invId]: felt }))
    showToast('Feedback saved ', 2000)
  }

  const handleShare = async (inv) => {
    const link = `${window.location.origin}/family-join?token=${inv.token}`
    const userName = inv.anonymous_mode ? 'Someone who cares about you' : profile?.full_name || 'Someone'
    const text = `${userName} would love your support on their recovery journey with LossLens.\n\nYou don't need to create an account â€” just click the link to see how they're doing: ${link}\n\n It's private, secure, and you can stop anytime.`

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on LossLens', text })
      } else {
        await navigator.clipboard.writeText(text)
        showToast(' Invitation link copied with message!', 2000)
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(text)
        showToast(' Link copied!', 2000)
      } catch {
        showToast(' Share this link: ' + link, 5000)
      }
    }
  }

  const getStatusBadge = (status) => {
    const map = {
      pending: { color: '#7DBDEE', bg: 'rgba(45,212,191,0.15)', label: 'â³ Pending' },
      active: { color: '#2DD4BF', bg: 'rgba(255,255,255,0.12)', label: ' Active' },
      declined: { color: '#FFFFFF', bg: 'rgba(255,255,255,0.08)', label: 'Ã¢ÂÅ’ Declined' },
      expired: { color: 'rgba(255,255,255,0.4)', bg: '#0B1220', label: 'â° Expired' },
      paused: { color: 'rgba(255,255,255,0.4)', bg: '#0B1220', label: 'â¸ Paused' },
    }
    return map[status] || map.pending
  }

  const activeSupporters = invitations.filter(i => i.status === 'active')
  const canInvite = invitations.filter(i => i.status === 'active' || i.status === 'pending').length < MAX_SUPPORTERS

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>{[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}</div>
    </div>
  )

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#0B1220', borderBottom: '1px solid rgba(255,255,255,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div><h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Family Portal</h1><p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{activeSupporters.length} active Â· {invitations.length} total</p></div>
        </nav>
        <div style={{ padding: '1.5rem' }}>
          <div className="dash-section" style={{ marginBottom: '1rem', borderColor: '#2DD4BF' }}>
            <div style={{ display: 'flex', gap: '12px' }}><span style={{ fontSize: '28px' }}></span><div><h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '6px' }}>Why invite a supporter?</h3><p style={{ color: '#7DBDEE', fontSize: '13px', lineHeight: '1.6', fontWeight: 300, margin: 0 }}>Recovery is easier with support. Invite trusted family or friends to follow your journey. They see only what you choose â€” no account needed.</p></div></div>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
            {[{ id: 'supporters', label: ` Supporters` }, { id: 'resources', label: ' Resources' }, { id: 'privacy', label: ' Privacy' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{tab.label}</button>
            ))}
          </div>

          {activeTab === 'supporters' && (
            <>
              {canInvite && (
                <button className="btn-primary full" onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem' }}>
                  {showForm ? ' Cancel' : `+ Add supporter (${invitations.filter(i => i.status === 'active' || i.status === 'pending').length}/${MAX_SUPPORTERS})`}
                </button>
              )}
              {showForm && (
                <div className="dash-section" style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}> Invite a supporter</h3>
                  <div className="form-group"><label>Name *</label><input type="text" value={form.supporter_name} onChange={e => setForm({ ...form, supporter_name: e.target.value })} placeholder="e.g. Mum" /></div>
                  <div className="form-group"><label>Relationship</label><input type="text" value={form.supporter_relation} onChange={e => setForm({ ...form, supporter_relation: e.target.value })} placeholder="e.g. Mother" /></div>
                  <div className="form-group"><label>Email (optional)</label><input type="email" value={form.supporter_email} onChange={e => setForm({ ...form, supporter_email: e.target.value })} placeholder="supporter@email.com" /></div>
                  <div className="form-group"><label>Phone (optional)</label><div className="phone-input"><span className="phone-prefix">ðŸ‡°ðŸ‡ª +254</span><input type="tel" value={form.supporter_phone} onChange={e => setForm({ ...form, supporter_phone: e.target.value })} /></div></div>
                  <div className="form-group"><label>What they can see</label><div className="chip-group">{ALL_PERMISSIONS.map(p => <button key={p} className={`chip ${form.permissions.includes(p) ? 'chip-active' : ''}`} onClick={() => togglePermission(p)}>{form.permissions.includes(p) ? ' ' : ''}{p}</button>)}</div></div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#2DD4BF', cursor: 'pointer' }}><input type="checkbox" checked={form.anonymous_mode} onChange={e => setForm({ ...form, anonymous_mode: e.target.checked })} />Anonymous</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#7DBDEE', cursor: 'pointer' }}><input type="checkbox" checked={form.crisis_contact} onChange={e => setForm({ ...form, crisis_contact: e.target.checked })} />Crisis contact</label>
                  </div>
                  <button className="btn-primary full" onClick={handleInvite} disabled={saving || !form.supporter_name.trim()}>
                    {saving ? <span className="spinner"></span> : 'Create invitation '}
                  </button>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>After creating, share the invitation link with them.</p>
                </div>
              )}

              {invitations.map(inv => {
                const status = getStatusBadge(inv.status)
                return (
                  <div key={inv.id} style={{ padding: '12px', background: '#0B1220', borderRadius: '10px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.12), #7DBDEE)', border: '2px solid #2DD4BF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#2DD4BF' }}>{inv.supporter_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}</div>
                        <div>
                          <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: 0 }}>{inv.anonymous_mode ? 'A loved one' : inv.supporter_name}{inv.crisis_contact && <span style={{ fontSize: '10px', color: '#7DBDEE', marginLeft: '6px' }}>ðŸ†˜</span>}</p>
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{inv.supporter_relation || 'Supporter'}</p>
                        </div>
                      </div>
                      <span style={{ background: status.bg, color: status.color, padding: '2px 8px', borderRadius: '100px', fontSize: '10px', whiteSpace: 'nowrap' }}>{status.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>{(inv.permissions || []).slice(0, 3).map(p => <span key={p} style={{ fontSize: '9px', background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '1px 6px', borderRadius: '100px' }}>{p}</span>)}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {inv.status === 'active' && <button onClick={() => loadMessages(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}></button>}
                      <button onClick={() => handleShare(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Share</button>
                      {(inv.status === 'pending' || inv.status === 'expired') && <button onClick={() => handleResend(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Renew</button>}
                      {inv.status === 'active' && <button onClick={() => handleTogglePause(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#7DBDEE', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Pause</button>}
                      <button onClick={() => handleRemove(inv.id)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Remove</button>
                    </div>
                  </div>
                )
              })}
              {invitations.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}><span style={{ fontSize: '48px' }}></span><p style={{ color: '#2DD4BF', fontSize: '14px' }}>No supporters yet.</p></div>
              )}
            </>
          )}

          {activeTab === 'resources' && (
            <div className="dash-section">
              <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}> For supporters</h3>
              {SUPPORTER_RESOURCES.map((r, i) => <div key={i} style={{ padding: '12px', background: '#0B1220', borderRadius: '8px', marginBottom: '8px' }}><h4 style={{ color: '#FFFFFF', fontSize: '13px', marginBottom: '4px' }}>{r.title}</h4><p style={{ color: '#7DBDEE', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>{r.content}</p></div>)}
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="dash-section"><h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}> Your privacy</h3>
              {['Supporters never see diary content, money, or locations unless you allow it.', 'They see only what you choose to share â€” change anytime.', 'Change permissions or revoke access anytime.', 'Anonymous mode hides your identity.', 'Supporters don\'t need an account â€” they view via a secure link.'].map((t, i) => <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><span style={{ color: '#2DD4BF' }}>â€¢</span><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{t}</span></div>)}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes loadingDot { 0%,100%{opacity:0.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-4px)} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default FamilyPortalPage
