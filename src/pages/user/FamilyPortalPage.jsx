import { BrandLoader } from '../../components/Brand'
import { toast } from '../../components/ToastProvider'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'

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


function FamilyPortalPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('supporters')
  const [selectedInvitation, setSelectedInvitation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [feedbackGiven, setFeedbackGiven] = useState({})

  const [form, setForm] = useState({
    supporter_name: '', supporter_relation: '',
    permissions: ['Streak status', 'Goal progress', 'General mood'],
    anonymous_mode: false, crisis_contact: false, language: 'en'
  })
  const [shareInvite, setShareInvite] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Your session expired. Please sign in again.')
      setLoading(false)
      return
    }
    setUserId(session.user.id)
    const [{ data: profileData, error: profileError }, { data: invs, error: invitationsError }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', session.user.id).single(),
      supabase.rpc('supporter_owner_list_invitations'),
    ])
    if (profileError || invitationsError) {
      console.error('Family portal load failed:', profileError || invitationsError)
      setError('Could not load your supporter portal.')
      setLoading(false)
      return
    }
    setProfile(profileData)
    setInvitations(invs || [])
    setError('')
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
    if (!form.supporter_name.trim()) { toast.error('Please enter a name'); return }
    if (invitations.filter(i => i.status === 'active' || i.status === 'pending').length >= MAX_SUPPORTERS) {
      toast.error(`Maximum ${MAX_SUPPORTERS} supporters allowed`); return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('create_supporter_invitation', {
      p_supporter_name: form.supporter_name,
      p_supporter_email: null,
      p_supporter_phone: null,
      p_supporter_relation: form.supporter_relation || null,
      p_permissions: form.permissions,
      p_anonymous_mode: form.anonymous_mode,
      p_crisis_contact: form.crisis_contact,
    })

    if (!error && data) {
      setInvitations(prev => [data, ...prev])
      setShowForm(false)
      setForm({ supporter_name: '', supporter_relation: '', permissions: ['Streak status', 'Goal progress', 'General mood'], anonymous_mode: false, crisis_contact: false, language: 'en' })
      setShareInvite(data)
      toast.success('Invitation created! Share the link with them.', 3000)
    } else {
      console.error('Supporter invitation creation failed:', error)
      toast.error('Failed to create invitation. Try again.', 3000)
    }
    setSaving(false)
  }

  const handleResend = async (inv) => {
    const { error: renewError } = await supabase.rpc('supporter_owner_manage', {
      p_invitation_id: inv.id, p_action: 'renew', p_value: {},
    })
    if (renewError) {
      console.error('Supporter invitation renewal failed:', renewError)
      toast.error('Could not renew invitation.')
      return
    }
    toast.success('Invitation renewed! Share the link again.', 3000)
    fetchData()
  }

  const handleRemove = async (invId) => {
    if (!confirm('Remove this supporter?')) return
    const { error: removeError } = await supabase.rpc('supporter_owner_manage', {
      p_invitation_id: invId, p_action: 'remove', p_value: {},
    })
    if (removeError) {
      console.error('Supporter removal failed:', removeError)
      toast.error('Could not remove supporter.')
      return
    }
    setInvitations(prev => prev.filter(i => i.id !== invId))
    toast.success('Removed.', 2000)
  }

  const handleTogglePause = async (inv) => {
    const newStatus = inv.status === 'paused' ? 'active' : 'paused'
    const { error: toggleError } = await supabase.rpc('supporter_owner_manage', {
      p_invitation_id: inv.id, p_action: inv.status === 'paused' ? 'resume' : 'pause', p_value: {},
    })
    if (toggleError) {
      console.error('Supporter pause update failed:', toggleError)
      toast.error('Could not update supporter status.')
      return
    }
    setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, status: newStatus } : i))
    toast.success(newStatus === 'paused' ? 'Paused' : 'Resumed', 2000)
  }

  const handleToggleCrisis = async (inv) => {
    const { error: crisisError } = await supabase.rpc('supporter_owner_manage', {
      p_invitation_id: inv.id, p_action: 'toggle_crisis', p_value: { crisis_contact: !inv.crisis_contact },
    })
    if (crisisError) {
      console.error('Supporter crisis setting update failed:', crisisError)
      toast.error('Could not update crisis contact setting.')
      return
    }
    setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, crisis_contact: !i.crisis_contact } : i))
  }

  const loadMessages = async (inv) => {
    setSelectedInvitation(inv)
    const { data, error: messageError } = await supabase.rpc('supporter_owner_list_messages', { p_invitation_id: inv.id })
    if (messageError) {
      console.error('Supporter message load failed:', messageError)
      toast.error('Could not load messages.')
      setMessages([])
      return
    }
    setMessages(data || [])
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedInvitation) return
    const content = messageInput.trim()
    const { error: sendError } = await supabase.rpc('supporter_owner_post_message', {
      p_invitation_id: selectedInvitation.id, p_content: content,
    })
    if (sendError) {
      console.error('Supporter message send failed:', sendError)
      toast.error('Could not send message.')
      return
    }
    setMessages(prev => [...prev, { id: Date.now().toString(), invitation_id: selectedInvitation.id, sender: 'user', content, created_at: new Date().toISOString() }])
    setMessageInput('')
  }

  const giveFeedback = async (invId, felt) => {
    const { error: feedbackError } = await supabase.rpc('supporter_owner_feedback', {
      p_invitation_id: invId, p_felt_supported: felt,
    })
    if (feedbackError) {
      console.error('Supporter feedback save failed:', feedbackError)
      toast.error('Could not save feedback.')
      return
    }
    setFeedbackGiven(prev => ({ ...prev, [invId]: felt }))
    toast.success('Feedback saved', 2000)
  }

  const buildShareText = (inv) => {
    const link = `${window.location.origin}/family-join?token=${inv.token}`
    const userName = inv.anonymous_mode ? 'Someone who cares about you' : profile?.full_name || 'Someone'
    return { link, text: `${userName} would love your support on their recovery journey with LossLens.\n\nYou don't need to create an account — just click the link to see how they're doing: ${link}\n\nIt's private, secure, and you can stop anytime.` }
  }

  const handleShare = async (inv) => {
    const { link, text } = buildShareText(inv)

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on LossLens', text })
      } else {
        await navigator.clipboard.writeText(text)
        toast.success('Invitation link copied with message!', 2000)
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Link copied!', 2000)
      } catch {
        toast.info('Share this link: ' + link, 5000)
      }
    }
  }

  const shareVia = async (channel) => {
    const inv = shareInvite
    if (!inv) return
    const { link, text } = buildShareText(inv)
    if (channel === 'copy') {
      try { await navigator.clipboard.writeText(text); toast.success('Link copied!', 2000) } catch { toast.info('Share this link: ' + link, 5000) }
      return
    }
    if (channel === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return }
    if (channel === 'sms') { window.location.href = `sms:?&body=${encodeURIComponent(text)}`; return }
    // native share
    try {
      if (navigator.share) await navigator.share({ title: 'Join me on LossLens', text })
      else { await navigator.clipboard.writeText(text); toast.success('Link copied!', 2000) }
    } catch { /* user dismissed */ }
  }

  const getStatusBadge = (status) => {
    const map = {
      pending: { color: '#7DBDEE', bg: 'rgba(45,212,191,0.15)', label: 'Pending' },
      active: { color: '#2DD4BF', bg: 'rgba(255,255,255,0.12)', label: 'Active' },
      declined: { color: '#FFFFFF', bg: 'rgba(255,255,255,0.08)', label: 'Declined' },
      expired: { color: 'rgba(255,255,255,0.4)', bg: '#0B1220', label: 'Expired' },
      paused: { color: 'rgba(255,255,255,0.4)', bg: '#0B1220', label: 'Paused' },
    }
    return map[status] || map.pending
  }

  const activeSupporters = invitations.filter(i => i.status === 'active')
  const canInvite = invitations.filter(i => i.status === 'active' || i.status === 'pending').length < MAX_SUPPORTERS

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <BrandLoader variant="section" />
    </div>
  )

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',  }}>
          <div><h1 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'var(--font-body)', margin: 0 }}>Family Portal</h1><p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{activeSupporters.length} active  · {invitations.length} total</p></div>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div className="dash-section" style={{ marginBottom: '1rem', borderColor: '#2DD4BF' }}>
            <div style={{ display: 'flex', gap: '12px' }}><AppIcon name="heart" size={28} style={{ flexShrink: 0, color: '#2DD4BF' }} /><div><h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '6px' }}>Why invite a supporter?</h3><p style={{ color: '#7DBDEE', fontSize: '13px', lineHeight: '1.6', fontWeight: 300, margin: 0 }}>Recovery is easier with support. Invite trusted family or friends to follow your journey. They see only what you choose — no account needed.</p></div></div>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
            {[{ id: 'supporters', label: ` Supporters` }, { id: 'resources', label: ' Resources' }, { id: 'privacy', label: ' Privacy' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: activeTab === tab.id ? '#2DD4BF' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{tab.label}</button>
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
                  <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}>Invite a supporter</h3>
                  <div className="form-group"><label>Name *</label><input type="text" value={form.supporter_name} onChange={e => setForm({ ...form, supporter_name: e.target.value })} placeholder="e.g. Mum" /></div>
                  <div className="form-group"><label>Relationship</label><input type="text" value={form.supporter_relation} onChange={e => setForm({ ...form, supporter_relation: e.target.value })} placeholder="e.g. Mother" /></div>
                  <div className="form-group"><label>What they can see</label><div className="chip-group">{ALL_PERMISSIONS.map(p => <button key={p} className={`chip ${form.permissions.includes(p) ? 'chip-active' : ''}`} onClick={() => togglePermission(p)}>{p}</button>)}</div></div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#2DD4BF', cursor: 'pointer' }}><input type="checkbox" checked={form.anonymous_mode} onChange={e => setForm({ ...form, anonymous_mode: e.target.checked })} />Anonymous</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#7DBDEE', cursor: 'pointer' }}><input type="checkbox" checked={form.crisis_contact} onChange={e => setForm({ ...form, crisis_contact: e.target.checked })} />Crisis contact</label>
                  </div>
                  <button className="btn-primary full" onClick={handleInvite} disabled={saving || !form.supporter_name.trim()}>
                    {saving ? <BrandLoader variant="inline" showWordmark={false} /> : 'Create invitation'}
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
                          <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 500, margin: 0 }}>{inv.anonymous_mode ? 'A loved one' : inv.supporter_name}{inv.crisis_contact && <span style={{ fontSize: '10px', color: '#7DBDEE', marginLeft: '6px' }}><AppIcon name="alert" size={12} /></span>}</p>
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{inv.supporter_relation || 'Supporter'}</p>
                        </div>
                      </div>
                      <span style={{ background: status.bg, color: status.color, padding: '2px 8px', borderRadius: '100px', fontSize: '10px', whiteSpace: 'nowrap' }}>{status.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>{(inv.permissions || []).slice(0, 3).map(p => <span key={p} style={{ fontSize: '9px', background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '1px 6px', borderRadius: '100px' }}>{p}</span>)}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {inv.status === 'active' && <button onClick={() => loadMessages(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '4px' }}><AppIcon name="chat" size={12} /> Messages</button>}
                      <button onClick={() => handleShare(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}> Share</button>
                      {(inv.status === 'pending' || inv.status === 'expired') && <button onClick={() => handleResend(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid #2DD4BF', color: '#2DD4BF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Renew</button>}
                      {inv.status === 'active' && <button onClick={() => handleTogglePause(inv)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#7DBDEE', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Pause</button>}
                      <button onClick={() => handleRemove(inv.id)} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Remove</button>
                    </div>
                  </div>
                )
              })}
              {invitations.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}><AppIcon name="users" size={48} style={{ display: 'block', margin: '0 auto 8px', color: '#2DD4BF' }} /><p style={{ color: '#2DD4BF', fontSize: '14px' }}>No supporters yet.</p></div>

              )}
            </>
          )}

          {activeTab === 'resources' && (
            <div className="dash-section">
              <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}>For supporters</h3>
              {SUPPORTER_RESOURCES.map((r, i) => <div key={i} style={{ padding: '12px', background: '#0B1220', borderRadius: '8px', marginBottom: '8px' }}><h4 style={{ color: '#FFFFFF', fontSize: '13px', marginBottom: '4px' }}>{r.title}</h4><p style={{ color: '#7DBDEE', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>{r.content}</p></div>)}
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="dash-section"><h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '1rem' }}> Your privacy</h3>
              {['Supporters never see diary content, money, or locations unless you allow it.', 'They see only what you choose to share — change anytime.', 'Change permissions or revoke access anytime.', 'Anonymous mode hides your identity.', 'Supporters don\'t need an account — they view via a secure link.'].map((t, i) => <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><span style={{ color: '#2DD4BF' }}>•</span><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{t}</span></div>)}
            </div>
          )}
        </div>
      </div>

      {shareInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.8)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShareInvite(null)}>
          <div style={{ background: '#0B1220', border: '1px solid #2DD4BF', borderRadius: '16px', padding: '1.5rem', maxWidth: '380px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#2DD4BF', fontSize: '16px', margin: '0 0 6px' }}>Share invitation link</h3>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', margin: '0 0 14px', wordBreak: 'break-all' }}>{buildShareText(shareInvite).link}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-primary full" onClick={() => void shareVia('copy')}>Copy link</button>
              <button className="btn-secondary full" onClick={() => void shareVia('whatsapp')}>WhatsApp</button>
              <button className="btn-secondary full" onClick={() => void shareVia('sms')}>SMS</button>
              {typeof navigator !== 'undefined' && navigator.share && <button className="btn-secondary full" onClick={() => void shareVia('native')}>More options</button>}
            </div>
            <button className="btn-ghost full" style={{ marginTop: '10px' }} onClick={() => setShareInvite(null)}>Done</button>
          </div>
        </div>
      )}
      <style>{`
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } }
      `}</style>
    </div>
  )
}

export default FamilyPortalPage
