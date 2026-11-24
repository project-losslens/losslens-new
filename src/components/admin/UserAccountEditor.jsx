import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabase'
import { toast } from '../ToastProvider'

const ROLES = ['user', 'admin', 'therapist', 'insurer', 'super_admin']
const ROLE_LABELS = {
  user: 'users.roleUser',
  admin: 'users.roleAdmin',
  therapist: 'users.roleTherapist',
  insurer: 'users.roleInsurer',
  super_admin: 'users.roleSuperAdmin',
}
const ACTIONS = [
  'admin_role_changed',
  'admin_profile_updated',
  'admin_email_updated',
  'admin_reset_link_sent',
  'admin_temporary_password_set',
  'admin_temporary_password_changed',
]

export default function UserAccountEditor({ user, actorId, isLastActiveSuperAdmin, onClose, onUpdated }) {
  const { t } = useI18n()
  const [section, setSection] = useState('role')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [stepUpPassword, setStepUpPassword] = useState('')
  const [role, setRole] = useState(user.role || 'user')
  const [insurers, setInsurers] = useState([])
  const [therapists, setTherapists] = useState([])
  const [insurerId, setInsurerId] = useState('')
  const [acknowledgeOpenWork, setAcknowledgeOpenWork] = useState(false)
  const [reassignmentTherapistId, setReassignmentTherapistId] = useState('')
  const [profile, setProfile] = useState({
    username: user.username || '',
    fullName: user.full_name || '',
    phone: user.phone || '',
  })
  const [credentialAction, setCredentialAction] = useState('send-reset-link')
  const [email, setEmail] = useState(user.email || '')
  const [history, setHistory] = useState([])
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isSelf = user.id === actorId
  const protectedTarget = isSelf || user.role === 'super_admin'
  const canEditRole = !isSelf && !(user.role === 'super_admin' && isLastActiveSuperAdmin)
  const needsRoleStepUp = (user.role === 'super_admin' && role !== 'super_admin')
    || (role === 'super_admin' && user.role !== 'super_admin')
  const expectedConfirmation = user.username || user.email || user.id
  const confirmationMatches = confirmation.trim() === expectedConfirmation

  const roleOptions = useMemo(() => ROLES.filter((item) => item !== user.role), [user.role])

  useEffect(() => {
    let active = true
    const loadSupportingData = async () => {
      const [insurerResult, therapistResult, historyResult] = await Promise.all([
        supabase.from('insurers').select('id, name').eq('status', 'active').order('name'),
        supabase.from('profiles').select('id, full_name, username').eq('role', 'therapist').eq('status', 'active'),
        supabase.from('audit_logs').select('id, action, metadata, created_at')
          .eq('target_table', 'profiles').eq('target_id', user.id)
          .in('action', ACTIONS).order('created_at', { ascending: false }).limit(10),
      ])
      if (!active) return
      if (insurerResult.error) toast.error(insurerResult.error.message)
      else setInsurers(insurerResult.data || [])
      if (therapistResult.error) toast.error(therapistResult.error.message)
      else setTherapists(therapistResult.data || [])
      if (historyResult.error) toast.error(historyResult.error.message)
      else setHistory(historyResult.data || [])
    }
    void loadSupportingData()
    return () => { active = false }
  }, [user.id])

  const runAction = async (action, data) => {
    if (!confirmationMatches) { toast.error(t('users.confirmationMismatch')); return }
    if (reason.trim().length < 5) { toast.error(t('users.reasonRequired')); return }
    setBusy(true)
    const { data: response, error } = await supabase.functions.invoke('admin-user-update', {
      body: {
        action,
        targetId: user.id,
        reason: reason.trim(),
        typedConfirmation: confirmation.trim(),
        ownPassword: stepUpPassword,
        ...data,
      },
    })
    if (error || response?.error) {
      if (response?.temporaryPassword) setTemporaryPassword(response.temporaryPassword)
      toast.error(response?.error || error?.message || t('users.updateFailed'))
      setBusy(false)
      return null
    }
    return response || {}
  }

  const saveRole = async () => {
    if (!canEditRole) return
    if (role === 'insurer' && !insurerId) { toast.error(t('users.selectInsurer')); return }
    const result = await runAction('set-role', {
      newRole: role,
      insurerId: role === 'insurer' ? insurerId : null,
      acknowledgeOpenWork,
      reassignmentTherapistId: reassignmentTherapistId || null,
    })
    if (!result) { setBusy(false); return }
    toast.success(t('users.roleSaved'))
    await onUpdated()
    setBusy(false)
    onClose()
  }

  const saveProfile = async () => {
    const result = await runAction('set-profile', {
      username: profile.username,
      fullName: profile.fullName,
      phone: protectedTarget ? null : profile.phone,
    })
    if (!result) { setBusy(false); return }
    toast.success(t('users.profileSaved'))
    await onUpdated()
    setBusy(false)
  }

  const saveCredentials = async () => {
    if (credentialAction === 'set-email') {
      const result = await runAction('set-email', { email: email.trim() })
      if (!result) { setBusy(false); return }
      toast.success(t('users.emailUpdated'))
    } else if (credentialAction === 'set-temporary-password') {
      const result = await runAction('set-temporary-password', {})
      if (!result) { setBusy(false); return }
      setTemporaryPassword(result.temporaryPassword || '')
      toast.success(t('users.temporaryPasswordCreated'))
    } else {
      const result = await runAction('send-reset-link', {})
      if (!result) { setBusy(false); return }
      toast.success(t('users.resetLinkSent'))
    }
    setBusy(false)
    await onUpdated()
  }

  const copyTemporaryPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      toast.success(t('users.passwordCopied'))
    } catch {
      toast.error(t('users.passwordCopyFailed'))
    }
  }

  const roleDisabledReason = isSelf
    ? t('users.selfRoleDisabled')
    : isLastActiveSuperAdmin && user.role === 'super_admin'
      ? t('users.lastSuperAdminDisabled')
      : ''

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'rgb(var(--bg-rgb) / 0.94)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0.5rem' }}>
      <button type="button" className="modal-backdrop" aria-label={t('users.closeEditor')} onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="account-editor-title"
        style={{ position: 'relative', zIndex: 1, background: 'var(--bg)', border: '1px solid rgb(var(--primary-rgb) / 0.4)', borderRadius: '14px', width: '100%', maxWidth: '620px', maxHeight: '94vh', overflowY: 'auto', padding: 'clamp(14px, 4vw, 24px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 id="account-editor-title" style={{ color: 'var(--primary)', margin: 0 }}>{t('users.editUserTitle')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', overflowWrap: 'anywhere' }}>
              {user.full_name || user.username || user.email || user.id}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('users.closeEditor')} style={{ minWidth: 44, minHeight: 44, color: 'var(--text)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8 }}>×</button>
        </div>

        <nav aria-label={t('users.editUser')} style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16 }}>
          {['role', 'profile', 'credentials'].map((item) => (
            <button type="button" key={item} onClick={() => setSection(item)}
              aria-current={section === item ? 'page' : undefined}
              style={{ flex: '1 0 auto', minHeight: 44, padding: '8px 12px', borderRadius: 8, color: section === item ? 'var(--bg)' : 'var(--primary)', background: section === item ? 'var(--primary)' : 'transparent', border: '1px solid var(--primary)' }}>
              {t(`users.${item}Section`)}
            </button>
          ))}
        </nav>

        {section === 'role' && (
          <div>
            <fieldset disabled={!canEditRole || busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ color: 'var(--primary)', marginBottom: 8 }}>{t('users.roleSection')}</legend>
              <div className="form-group">
                <label htmlFor="account-role">{t('users.role')}</label>
                <select id="account-role" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value={user.role}>{t(ROLE_LABELS[user.role] || 'users.roleUser')}</option>
                  {roleOptions.map((item) => <option key={item} value={item}>{t(ROLE_LABELS[item])}</option>)}
                </select>
                {roleDisabledReason && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{roleDisabledReason}</p>}
              </div>
              {role === 'insurer' && (
                <div className="form-group">
                  <label htmlFor="account-insurer">{t('users.insurerOrganisation')}</label>
                  <select id="account-insurer" value={insurerId} onChange={(event) => setInsurerId(event.target.value)}>
                    <option value="">{t('users.selectInsurer')}</option>
                    {insurers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              )}
              {user.role === 'therapist' && role !== 'therapist' && (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0' }}>
                    <input type="checkbox" checked={acknowledgeOpenWork} onChange={(event) => setAcknowledgeOpenWork(event.target.checked)} />
                    <span>{t('users.reassignOpenWork')}</span>
                  </label>
                  <div className="form-group">
                    <label htmlFor="reassignment-therapist">{t('users.reassignTherapist')}</label>
                    <select id="reassignment-therapist" value={reassignmentTherapistId} onChange={(event) => setReassignmentTherapistId(event.target.value)}>
                      <option value="">{t('users.selectTherapist')}</option>
                      {therapists.filter((item) => item.id !== user.id).map((item) => (
                        <option key={item.id} value={item.id}>{item.full_name || item.username || item.id}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="form-group">
                <label htmlFor="role-reason">{t('users.roleReason')}</label>
                <input id="role-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
              </div>
              <div className="form-group">
                <label htmlFor="role-confirmation">{t('users.confirmAccount')}</label>
                <input id="role-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required />
              </div>
              {needsRoleStepUp && (
                <div className="form-group">
                  <label htmlFor="role-step-up">{t('users.stepUpPassword')}</label>
                  <input id="role-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
                </div>
              )}
              <button type="button" className="btn-primary full" onClick={saveRole} disabled={!canEditRole || busy || !confirmationMatches}>
                {t('users.saveRole')}
              </button>
            </fieldset>
          </div>
        )}

        {section === 'profile' && (
          <div>
            <div className="form-group">
              <label htmlFor="account-username">{t('users.username')}</label>
              <input id="account-username" value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} maxLength={30} />
            </div>
            <div className="form-group">
              <label htmlFor="account-full-name">{t('users.fullName')}</label>
              <input id="account-full-name" value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} maxLength={200} />
            </div>
            <div className="form-group">
              <label htmlFor="account-phone">{t('users.phone')}</label>
              <input id="account-phone" type="tel" value={profile.phone} disabled={protectedTarget}
                onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} maxLength={24} />
              {protectedTarget && <small>{t('users.protectedPhone')}</small>}
            </div>
            <div className="form-group">
              <label htmlFor="profile-reason">{t('users.profileReason')}</label>
              <input id="profile-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
            </div>
            <div className="form-group">
              <label htmlFor="profile-confirmation">{t('users.confirmAccount')}</label>
              <input id="profile-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required />
            </div>
            <div className="form-group">
              <label htmlFor="profile-step-up">{t('users.stepUpPassword')}</label>
              <input id="profile-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
            </div>
            <button type="button" className="btn-primary full" onClick={saveProfile} disabled={busy || !confirmationMatches}>
              {t('users.saveProfile')}
            </button>
          </div>
        )}

        {section === 'credentials' && (
          <div>
            <div className="form-group">
              <label htmlFor="credential-action">{t('users.credentialsSection')}</label>
              <select id="credential-action" value={credentialAction} onChange={(event) => { setCredentialAction(event.target.value); setTemporaryPassword('') }}>
                <option value="send-reset-link">{t('users.sendReset')}</option>
                <option value="set-email" disabled={protectedTarget}>{t('users.changeEmail')}</option>
                <option value="set-temporary-password" disabled={protectedTarget}>{t('users.temporaryPassword')}</option>
              </select>
            </div>
            {credentialAction === 'set-email' && (
              <div className="form-group">
                <label htmlFor="account-email">{t('users.newEmail')}</label>
                <input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            )}
            {protectedTarget && <p role="note" style={{ color: 'var(--text-muted)' }}>{t('users.protectedCredentials')}</p>}
            <div className="form-group">
              <label htmlFor="credential-reason">{t('users.profileReason')}</label>
              <input id="credential-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
            </div>
            <div className="form-group">
              <label htmlFor="credential-confirmation">{t('users.confirmAccount')}</label>
              <input id="credential-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required />
            </div>
            <div className="form-group">
              <label htmlFor="credential-step-up">{t('users.stepUpPassword')}</label>
              <input id="credential-step-up" type="password" autoComplete="current-password" value={stepUpPassword} onChange={(event) => setStepUpPassword(event.target.value)} required />
            </div>
            <button type="button" className="btn-primary full" onClick={saveCredentials}
              disabled={busy || !confirmationMatches || (protectedTarget && credentialAction !== 'send-reset-link')}>
              {credentialAction === 'send-reset-link' ? t('users.sendReset') : t('users.saveCredentials')}
            </button>
            {temporaryPassword && (
              <div role="alert" style={{ border: '1px solid var(--primary)', borderRadius: 10, padding: 12, marginTop: 14 }}>
                <p>{t('users.temporaryPasswordWarning')}</p>
                <code style={{ display: 'block', overflowWrap: 'anywhere', userSelect: 'all' }}>{temporaryPassword}</code>
                <button type="button" onClick={copyTemporaryPassword} style={{ minHeight: 44, marginTop: 10 }}>{t('users.copyPassword')}</button>
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <section aria-label={t('users.accountHistory')} style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 20, paddingTop: 12 }}>
            <h3 style={{ color: 'var(--primary)', fontSize: 14 }}>{t('users.accountHistory')}</h3>
            {history.map((item) => (
              <p key={item.id} style={{ color: 'var(--text-muted)', fontSize: 12, overflowWrap: 'anywhere' }}>
                {new Date(item.created_at).toLocaleString()} — {item.action.replaceAll('_', ' ')}
                {item.metadata?.old_role && `: ${item.metadata.old_role} → ${item.metadata.new_role}`}
                {item.metadata?.reason && ` · ${item.metadata.reason}`}
              </p>
            ))}
          </section>
        )}
      </section>
    </div>
  )
}
