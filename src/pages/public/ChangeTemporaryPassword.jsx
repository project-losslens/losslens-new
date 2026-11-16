import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BrandLoader } from '../../components/Brand'
import { useAuthProfile } from '../../context/AuthProfileContext'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabase'
import { roleHome } from '../../config/roleHome'

export default function ChangeTemporaryPassword() {
  const { authStatus, user, mustChangePassword } = useAuthProfile()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (authStatus === 'loading') return <BrandLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!mustChangePassword) return <Navigate to={roleHome(user.role)} replace />

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < 12) { setError(t('account.passwordMinimum')); return }
    if (password === currentPassword) { setError(t('account.passwordMustDiffer')); return }
    if (password !== confirmPassword) { setError(t('account.passwordMismatch')); return }
    setSaving(true)
    const { data, error: invokeError } = await supabase.functions.invoke('admin-user-update', {
      body: {
        action: 'complete-temporary-password-change',
        targetId: user.id,
        currentPassword,
        password,
      },
    })
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || t('account.passwordChangeFailed'))
      setSaving(false)
      return
    }
    await supabase.auth.signOut({ scope: 'local' })
    setSaving(false)
    navigate('/login', { replace: true, state: { passwordChanged: true } })
  }

  return (
    <main className="auth-container" style={{ minHeight: '100vh', padding: '1rem' }}>
      <section className="auth-card" style={{ width: '100%', maxWidth: '440px', margin: 'auto' }}>
        <h1 className="auth-title">{t('account.passwordChangeTitle')}</h1>
        <p className="auth-sub">{t('account.passwordChangeMessage')}</p>
        {error && <p role="alert" aria-live="polite" style={{ color: 'var(--text)' }}>{error}</p>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="temporary-password">{t('account.temporaryPassword')}</label>
            <input id="temporary-password" type="password" autoComplete="current-password" required
              value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="new-password">{t('account.newPassword')}</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={12} required
              value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">{t('account.confirmPassword')}</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required
              value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          <button type="submit" className="btn-primary full" disabled={saving}>
            {saving ? t('account.savingPassword') : t('account.changePassword')}
          </button>
        </form>
      </section>
    </main>
  )
}
