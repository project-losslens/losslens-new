import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

const ROLES = { USER: 'user', ADMIN: 'admin', SUPER_ADMIN: 'super_admin' }

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#7DBDEE;color:#2DD4BF;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(11,18,32,0.4);border:1px solid rgba(255,255,255,0.4);white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function AdminManagement() {
  const navigate = useNavigate()
  const [admins, setAdmins] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toastMsg, setToastMsg] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [showPromote, setShowPromote] = useState(false)
  const [promoteInput, setPromoteInput] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(null)
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const displayToast = useCallback((msg, type = 'success') => {
    setToastMsg({ msg, type })
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  const fetchEmail = async (userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_email', { user_id: userId })
      if (error) throw error
      return data || null
    } catch (err) {
      return null
    }
  }

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [adminRes, sessionRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .in('role', [ROLES.ADMIN, ROLES.SUPER_ADMIN])
          .order('created_at', { ascending: false }),
        supabase.auth.getSession(),
      ])

      setCurrentUserId(sessionRes?.data?.session?.user?.id || null)

      let adminData = adminRes.data || []

      if (adminData.length > 0) {
        const adminWithEmails = await Promise.all(
          adminData.map(async (admin) => {
            const email = await fetchEmail(admin.id)
            return { ...admin, email }
          })
        )
        setAdmins(adminWithEmails)
      } else {
        setAdmins([])
      }
    } catch (err) {
      setError('Failed to load admins.')
      console.error('Admin fetch error:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  const isSelf = (userId) => userId === currentUserId

  const revokeAdmin = async (userId) => {
    if (isSelf(userId)) { displayToast('You cannot revoke your own admin access.', 'error'); return }
    setActionLoading(userId)
    try {
      const { error: revokeError } = await supabase.from('profiles').update({ role: ROLES.USER }).eq('id', userId)
      if (revokeError) throw revokeError
      setAdmins(prev => prev.filter(a => a.id !== userId))
      displayToast('Admin access revoked.')
    } catch (err) { displayToast('Failed to revoke.', 'error') }
    setActionLoading(null)
    setShowRevokeConfirm(null)
  }

  const suspendAdmin = async (userId) => {
    if (isSelf(userId)) { displayToast('You cannot suspend yourself.', 'error'); return }
    setActionLoading(userId)
    try {
      const admin = admins.find(a => a.id === userId)
      const newStatus = (admin?.status === 'suspended') ? 'active' : 'suspended'
      const { error: suspendError } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId)
      if (suspendError) throw suspendError
      setAdmins(prev => prev.map(a => a.id === userId ? { ...a, status: newStatus } : a))
      displayToast(`Admin ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
    } catch (err) { displayToast('Failed to update.', 'error') }
    setActionLoading(null)
    setShowSuspendConfirm(null)
  }

  const deleteAdmin = async (userId) => {
    if (isSelf(userId)) { displayToast('You cannot delete yourself.', 'error'); return }
    setDeleting(true)
    try {
      const { error: delError } = await supabase.from('profiles').delete().eq('id', userId)
      if (delError) throw delError
      setAdmins(prev => prev.filter(a => a.id !== userId))
      displayToast('Admin deleted permanently.')
    } catch (err) { displayToast('Delete failed.', 'error') }
    setDeleting(false)
    setShowDeleteConfirm(null)
  }

  const sanitizeInput = (input) => {
    return input.replace(/[%_]/g, '\\$&').trim()
  }

  const promoteToAdmin = async () => {
    if (!promoteInput.trim()) return
    setPromoting(true)
    setError('')

    const sanitized = sanitizeInput(promoteInput)

    const { data: profiles, error: searchError } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${sanitized},full_name.ilike.%${sanitized}%,username.ilike.%${sanitized}%`)
      .limit(5)

    if (searchError || !profiles || profiles.length === 0) {
      setError('User not found. Try their name, username, or user ID.')
      setPromoting(false)
      return
    }

    if (profiles.length > 1) {
      setError(`Found ${profiles.length} users. Please be more specific or use their user ID.`)
      setPromoting(false)
      return
    }

    const profile = profiles[0]

    if (profile.role === ROLES.ADMIN || profile.role === ROLES.SUPER_ADMIN) {
      setError(`${profile.full_name || 'This user'} is already an admin.`)
      setPromoting(false)
      return
    }

    const { data, error: promoteError } = await supabase
      .from('profiles')
      .update({ role: ROLES.ADMIN, status: 'active' })
      .eq('id', profile.id)
      .select('*')
      .single()

    if (promoteError) {
      setError('Failed to promote user.')
    } else if (data) {
      const email = await fetchEmail(data.id)
      const newAdmin = { ...data, email }
      setAdmins(prev => [newAdmin, ...prev])
      displayToast(`${data.full_name || 'User'} promoted to admin!`)
      setPromoteInput('')
      setShowPromote(false)
    }
    setPromoting(false)
  }

  const { superAdmins, regularAdmins, suspendedAdmins } = useMemo(() => ({
    superAdmins: admins.filter(a => a.role === ROLES.SUPER_ADMIN),
    regularAdmins: admins.filter(a => a.role === ROLES.ADMIN),
    suspendedAdmins: admins.filter(a => a.status === 'suspended'),
  }), [admins])

  const btnStyle = (bg, color, border) => ({
    padding: '7px 14px', borderRadius: '8px', border: `1px solid ${border || bg}`,
    background: bg, color, fontSize: '12px', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontWeight: 500,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2DD4BF', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#7DBDEE', fontSize: '13px' }}>Loading admins...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1220' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#0B1220', borderBottom: '2px solid #2DD4BF', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#2DD4BF', fontFamily: "'Inter', sans-serif", margin: 0 }}> Admin Management</h1>
            <p style={{ fontSize: '12px', color: '#7DBDEE', margin: '2px 0 0' }}>{regularAdmins.length} admins  · {superAdmins.length} super admins  · {suspendedAdmins.length} suspended</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchAdmins} style={{ padding: '6px 14px', borderRadius: '100px', background: 'transparent', border: '1px solid #7DBDEE', color: '#7DBDEE', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}> Refresh</button>
            <button onClick={() => setShowPromote(!showPromote)} style={{ padding: '8px 18px', borderRadius: '100px', background: '#2DD4BF', border: 'none', color: '#0B1220', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{showPromote ? ' Cancel' : ' Promote to Admin'}</button>
          </div>
        </nav>

        {toastMsg && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toastMsg.type === 'error' ? 'rgba(255,255,255,0.08)' : '#7DBDEE', color: toastMsg.type === 'error' ? '#FFFFFF' : '#2DD4BF', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toastMsg.msg}</div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {error && (
            <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #FFFFFF', borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>
          )}

          {showPromote && (
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #2DD4BF', borderRadius: '14px', padding: '20px', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#2DD4BF', fontSize: '15px', margin: '0 0 1rem' }}>⬆ Promote User to Admin</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Enter user name, username, or ID..." value={promoteInput} onChange={e => setPromoteInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && promoteToAdmin()}
                  style={{ flex: 1, minWidth: '250px', padding: '10px 14px', borderRadius: '8px', background: '#0B1220', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif" }} />
                <button onClick={promoteToAdmin} disabled={promoting || !promoteInput.trim()}
                  style={{ ...btnStyle('#2DD4BF', '#0B1220', '#2DD4BF'), opacity: !promoteInput.trim() ? 0.5 : 1 }}>
                  {promoting ? '⏳...' : 'Promote'}
                </button>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '6px' }}> Admins have full access to user data, crisis alerts, and platform management.</p>
            </div>
          )}

          {/* Super Admins Section — View Only */}
          {superAdmins.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '0.75rem' }}> Super Admins</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {superAdmins.map(a => {
                  const isCurrentUser = isSelf(a.id)
                  return (
                    <div key={a.id} style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid #2DD4BF',
                      borderRadius: '12px', padding: '16px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>
                              {a.full_name || 'Unnamed'}
                              {a.username && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 400 }}> @{a.username}</span>}
                            </span>
                            <span style={{ background: 'rgba(45,212,191,0.15)', color: '#2DD4BF', border: '1px solid #2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}> Super Admin</span>
                            {isCurrentUser && <span style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid #2DD4BF' }}>You</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}> {a.email || 'No email'}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}> {a.phone || 'No phone'}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Joined {new Date(a.created_at).toLocaleDateString('en-KE')}</span>
                          </div>
                        </div>
                        {/* Super Admins: no actions — view only */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontStyle: 'italic' }}>Protected</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Regular Admins Section — Full Management */}
          {regularAdmins.length === 0 && superAdmins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
              <p style={{ color: '#2DD4BF', fontSize: '14px' }}>No admins found. Promote a user to get started.</p>
            </div>
          ) : regularAdmins.length > 0 && (
            <div>
              <h3 style={{ color: '#2DD4BF', fontSize: '14px', marginBottom: '0.75rem' }}> Admins</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {regularAdmins.map(a => {
                  const isSuspended = a.status === 'suspended'
                  const isCurrentUser = isSelf(a.id)

                  return (
                    <div key={a.id} style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${isSuspended ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: '12px', padding: '16px',
                      opacity: isSuspended ? 0.7 : 1,
                      transition: 'border-color 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>
                              {a.full_name || 'Unnamed'}
                              {a.username && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 400 }}> @{a.username}</span>}
                              {isCurrentUser && <span style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', border: '1px solid #2DD4BF' }}>You</span>}
                            </span>
                            <span style={{ background: 'rgba(255,255,255,0.12)', color: '#2DD4BF', border: '1px solid #2DD4BF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}> Admin</span>
                            {isSuspended && (
                              <span style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid #FFFFFF', padding: '2px 8px', borderRadius: '100px', fontSize: '10px' }}>⏸ Suspended</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}> {a.email || 'No email'}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}> {a.phone || 'No phone'}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Joined {new Date(a.created_at).toLocaleDateString('en-KE')}</span>
                          </div>
                        </div>
                        {/* Regular Admins: full actions */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <button onClick={() => setShowSuspendConfirm(a)} disabled={actionLoading === a.id || isCurrentUser}
                            style={btnStyle('transparent', isSuspended ? '#2DD4BF' : '#7DBDEE', isSuspended ? '#2DD4BF' : '#7DBDEE')}
                            title={isCurrentUser ? 'Cannot suspend yourself' : isSuspended ? 'Reactivate admin' : 'Suspend admin'}>
                            {actionLoading === a.id ? '...' : isSuspended ? '▶ Reactivate' : '⏸ Suspend'}
                          </button>
                          <button onClick={() => setShowRevokeConfirm(a)} disabled={actionLoading === a.id || isCurrentUser}
                            style={btnStyle('transparent', '#7DBDEE', '#7DBDEE')}
                            title={isCurrentUser ? 'Cannot revoke yourself' : 'Revoke admin to user'}>
                            {actionLoading === a.id ? '...' : '⬇ Revoke'}
                          </button>
                          <button onClick={() => setShowDeleteConfirm(a)} disabled={actionLoading === a.id || isCurrentUser}
                            style={btnStyle('transparent', '#FFFFFF', 'rgba(255,255,255,0.08)')}
                            title={isCurrentUser ? 'Cannot delete yourself' : 'Permanently delete admin'}>
                            {actionLoading === a.id ? '...' : ' Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suspend Modal */}
      {showSuspendConfirm && (
        <div onClick={() => setShowSuspendConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: `1px solid ${showSuspendConfirm.status === 'suspended' ? '#2DD4BF' : '#7DBDEE'}`, maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>{showSuspendConfirm.status === 'suspended' ? '▶' : '⏸'}</span>
            <h3 style={{ color: showSuspendConfirm.status === 'suspended' ? '#2DD4BF' : '#7DBDEE', fontSize: '16px', margin: '0 0 8px' }}>
              {showSuspendConfirm.status === 'suspended' ? 'Reactivate Admin?' : 'Suspend Admin?'}
            </h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              <strong style={{ color: '#2DD4BF' }}>"{showSuspendConfirm.full_name}"</strong> will be {showSuspendConfirm.status === 'suspended' ? 'reactivated' : 'suspended'}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSuspendConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => suspendAdmin(showSuspendConfirm.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: showSuspendConfirm.status === 'suspended' ? 'rgba(255,255,255,0.12)' : 'rgba(45,212,191,0.15)', border: 'none', color: showSuspendConfirm.status === 'suspended' ? '#2DD4BF' : '#2DD4BF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {showSuspendConfirm.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeConfirm && (
        <div onClick={() => setShowRevokeConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid #7DBDEE', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>⬇</span>
            <h3 style={{ color: '#7DBDEE', fontSize: '16px', margin: '0 0 8px' }}>Revoke Admin Access?</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              <strong style={{ color: '#2DD4BF' }}>"{showRevokeConfirm.full_name}"</strong> will become a regular user.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowRevokeConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => revokeAdmin(showRevokeConfirm.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(45,212,191,0.15)', border: 'none', color: '#2DD4BF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Revoke</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '380px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}></span>
            <h3 style={{ color: '#FFFFFF', fontSize: '16px', margin: '0 0 8px' }}>Delete Admin?</h3>
            <p style={{ color: '#2DD4BF', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              Permanently delete <strong style={{ color: '#2DD4BF' }}>"{showDeleteConfirm.full_name}"</strong>?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={() => deleteAdmin(showDeleteConfirm.id)} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
