import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import SuperAdminSidebar from '../../components/SuperAdminSidebar'

// ✅ Constants
const SETTINGS_KEYS = {
  APP_NAME: 'app_name', MAINTENANCE_MODE: 'maintenance_mode',
  ALLOW_SIGNUPS: 'allow_signups', REQUIRE_EMAIL_VERIFICATION: 'require_email_verification',
  MIN_PASSWORD_LENGTH: 'min_password_length', SESSION_TIMEOUT_MINUTES: 'session_timeout_minutes',
  MAX_LOGIN_ATTEMPTS: 'max_login_attempts', COOLDOWN_MINUTES: 'cooldown_minutes',
  CIRCLE_ENABLED: 'circle_enabled', WHISPERS_ENABLED: 'whispers_enabled',
  FAMILY_PORTAL_ENABLED: 'family_portal_enabled', PRECIOUS_PACT_ENABLED: 'precious_pact_enabled',
  MONTHLY_MIRROR_ENABLED: 'monthly_mirror_enabled', FREE_PLAN_DIARY_LIMIT: 'free_plan_diary_limit',
  PREMIUM_PRICE_KES: 'premium_price_kes', CRISIS_EMAIL: 'crisis_email',
  SUPPORT_EMAIL: 'support_email', SMS_ALERTS_ENABLED: 'sms_alerts_enabled',
  MPESA_ENABLED: 'mpesa_enabled', GOOGLE_OAUTH_ENABLED: 'google_oauth_enabled',
  REQUIRE_AGE_VERIFICATION: 'require_age_verification', MAX_SUPPORTERS_PER_USER: 'max_supporters_per_user',
  MESSAGE_RETENTION_DAYS: 'message_retention_days',
}

const DEFAULTS = {
  [SETTINGS_KEYS.APP_NAME]: 'Precious',
  [SETTINGS_KEYS.MAINTENANCE_MODE]: false,
  [SETTINGS_KEYS.ALLOW_SIGNUPS]: true,
  [SETTINGS_KEYS.REQUIRE_EMAIL_VERIFICATION]: true,
  [SETTINGS_KEYS.MIN_PASSWORD_LENGTH]: 8,
  [SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES]: 60,
  [SETTINGS_KEYS.MAX_LOGIN_ATTEMPTS]: 5,
  [SETTINGS_KEYS.COOLDOWN_MINUTES]: 5,
  [SETTINGS_KEYS.CIRCLE_ENABLED]: true,
  [SETTINGS_KEYS.WHISPERS_ENABLED]: true,
  [SETTINGS_KEYS.FAMILY_PORTAL_ENABLED]: true,
  [SETTINGS_KEYS.PRECIOUS_PACT_ENABLED]: true,
  [SETTINGS_KEYS.MONTHLY_MIRROR_ENABLED]: true,
  [SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT]: 7,
  [SETTINGS_KEYS.PREMIUM_PRICE_KES]: 500,
  [SETTINGS_KEYS.CRISIS_EMAIL]: '',
  [SETTINGS_KEYS.SUPPORT_EMAIL]: '',
  [SETTINGS_KEYS.SMS_ALERTS_ENABLED]: false,
  [SETTINGS_KEYS.MPESA_ENABLED]: false,
  [SETTINGS_KEYS.GOOGLE_OAUTH_ENABLED]: false,
  [SETTINGS_KEYS.REQUIRE_AGE_VERIFICATION]: true,
  [SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER]: 5,
  [SETTINGS_KEYS.MESSAGE_RETENTION_DAYS]: 90,
}

const VALIDATION = {
  [SETTINGS_KEYS.MIN_PASSWORD_LENGTH]: { min: 6, max: 20, message: 'Must be 6-20' },
  [SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES]: { min: 15, max: 480, message: 'Must be 15-480' },
  [SETTINGS_KEYS.MAX_LOGIN_ATTEMPTS]: { min: 3, max: 10, message: 'Must be 3-10' },
  [SETTINGS_KEYS.COOLDOWN_MINUTES]: { min: 1, max: 60, message: 'Must be 1-60' },
  [SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT]: { min: 1, max: 30, message: 'Must be 1-30' },
  [SETTINGS_KEYS.PREMIUM_PRICE_KES]: { min: 100, max: 10000, message: 'Must be 100-10,000' },
  [SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER]: { min: 1, max: 10, message: 'Must be 1-10' },
  [SETTINGS_KEYS.MESSAGE_RETENTION_DAYS]: { min: 7, max: 365, message: 'Must be 7-365' },
}

const SECTION_TABS = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'security', label: 'Security', icon: '🔐' },
  { id: 'features', label: 'Features', icon: '🔧' },
  { id: 'pricing', label: 'Pricing', icon: '💵' },
  { id: 'integrations', label: 'Integrations', icon: '📡' },
]

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1d5c38;color:#6ee7b7;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid #3b7a5a;white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function SystemSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({ ...DEFAULTS })
  const [originalSettings, setOriginalSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeSection, setActiveSection] = useState('general')
  const [showConfirm, setShowConfirm] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

  const displayToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ✅ Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!originalSettings) return false
    return Object.keys(settings).some(key => settings[key] !== originalSettings[key])
  }, [settings, originalSettings])

  // ✅ Warn on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase.from('system_settings').select('key, value')
      if (fetchError) throw fetchError
      
      const parsed = { ...DEFAULTS }
      if (data) {
        data.forEach(({ key, value }) => {
          try { parsed[key] = JSON.parse(value) } catch { parsed[key] = value }
        })
      }
      setSettings(parsed)
      setOriginalSettings({ ...parsed })
    } catch (err) {
      console.error('Settings fetch error:', err)
      setError('Failed to load settings.')
    } finally { setLoading(false) }
  }

  const validateAll = () => {
    const errors = {}
    Object.entries(VALIDATION).forEach(([key, rules]) => {
      const val = settings[key]
      if (val < rules.min || val > rules.max) {
        errors[key] = rules.message
      }
    })
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveSettings = async () => {
    if (!validateAll()) { displayToast('Fix validation errors before saving.', 'error'); return }
    
    // ✅ Confirmation for critical changes
    if (settings[SETTINGS_KEYS.MAINTENANCE_MODE] && !originalSettings?.[SETTINGS_KEYS.MAINTENANCE_MODE]) {
      setShowConfirm('maintenance')
      return
    }
    if (!settings[SETTINGS_KEYS.ALLOW_SIGNUPS] && originalSettings?.[SETTINGS_KEYS.ALLOW_SIGNUPS]) {
      setShowConfirm('signups')
      return
    }

    await doSave()
  }

  const doSave = async () => {
    setSaving(true)
    setShowConfirm(null)
    try {
      const upserts = Object.entries(settings).map(([key, value]) => ({
        key,
        value: JSON.stringify(value),
      }))
      const { error: upsertError } = await supabase.from('system_settings').upsert(upserts, { onConflict: 'key' })
      if (upsertError) throw upsertError
      setOriginalSettings({ ...settings })
      displayToast('Settings saved successfully!')
    } catch (err) { displayToast('Failed to save settings.', 'error') }
    setSaving(false)
  }

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setValidationErrors(prev => ({ ...prev, [key]: undefined }))
  }

  const resetToDefault = (key) => {
    if (DEFAULTS[key] !== undefined) {
      update(key, DEFAULTS[key])
      displayToast('Reset to default.')
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#e2f5ec', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }

  const ToggleRow = ({ label, desc, value, onChange }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #0a3d22' }}>
      <div>
        <span style={{ color: '#9fe1cb', fontSize: '13px' }}>{label}</span>
        {desc && <p style={{ color: '#3b7a5a', fontSize: '11px', margin: '2px 0 0' }}>{desc}</p>}
      </div>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer', flexShrink: 0 }} />
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <p style={{ color: '#FAC775', fontSize: '13px' }}>Loading settings...</p>
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
        <SuperAdminSidebar />
        <div style={{ flex: 1, marginLeft: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="main-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#F09595', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchSettings} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #F09595', color: '#F09595', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#041f13' }}>
      <SuperAdminSidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#041f13', borderBottom: '2px solid #f59e0b', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b', fontFamily: "'Inter', sans-serif", margin: 0 }}>System Settings</h1>
            <p style={{ fontSize: '12px', color: '#FAC775', margin: '2px 0 0' }}>
              Platform configuration{hasUnsavedChanges ? ' · Unsaved changes' : ''}
            </p>
          </div>
          <button onClick={saveSettings} disabled={saving || !hasUnsavedChanges}
            style={{ padding: '10px 24px', borderRadius: '100px', border: 'none', background: hasUnsavedChanges ? '#f59e0b' : '#0a3d22', color: hasUnsavedChanges ? '#041f13' : '#3b7a5a', fontSize: '13px', fontWeight: 600, cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </nav>

        {toast && (
          <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#791F1F' : '#1d5c38', color: toast.type === 'error' ? '#F09595' : '#6ee7b7', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', zIndex: 3000, whiteSpace: 'nowrap' }}>{toast.msg}</div>
        )}

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: '#062616', borderRadius: '12px', padding: '4px', border: '1px solid #0a3d22', overflowX: 'auto' }}>
            {SECTION_TABS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeSection === s.id ? '#633806' : 'transparent', color: activeSection === s.id ? '#f59e0b' : '#3b7a5a', fontSize: '12px', fontWeight: activeSection === s.id ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', minWidth: '80px', transition: 'background 0.2s, color 0.2s' }}>{s.label}</button>
            ))}
          </div>

          <div style={{ background: '#062616', border: '1px solid #0a3d22', borderRadius: '14px', padding: '20px' }}>
            {/* GENERAL */}
            {activeSection === 'general' && (
              <div>
                <h3 style={{ color: '#f59e0b', fontSize: '15px', margin: '0 0 1rem' }}>General Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>App Name</label>
                      <input type="text" value={settings.app_name} onChange={e => update(SETTINGS_KEYS.APP_NAME, e.target.value)} style={inputStyle} />
                    </div>
                    <button onClick={() => resetToDefault(SETTINGS_KEYS.APP_NAME)} style={{ padding: '10px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
                  </div>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Support Email</label>
                    <input type="email" value={settings.support_email} onChange={e => update(SETTINGS_KEYS.SUPPORT_EMAIL, e.target.value)} style={inputStyle} placeholder="support@precious.app" />
                  </div>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Crisis Alert Email</label>
                    <input type="email" value={settings.crisis_email} onChange={e => update(SETTINGS_KEYS.CRISIS_EMAIL, e.target.value)} style={inputStyle} placeholder="alerts@precious.app" />
                  </div>
                  <ToggleRow label="Maintenance Mode" desc="Blocks all non-admin access" value={settings.maintenance_mode} onChange={v => update(SETTINGS_KEYS.MAINTENANCE_MODE, v)} />
                  <ToggleRow label="Allow New Signups" desc="Turn off to prevent new registrations" value={settings.allow_signups} onChange={v => update(SETTINGS_KEYS.ALLOW_SIGNUPS, v)} />
                </div>
              </div>
            )}

            {/* SECURITY */}
            {activeSection === 'security' && (
              <div>
                <h3 style={{ color: '#f59e0b', fontSize: '15px', margin: '0 0 1rem' }}>Security & Access</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {[
                      [SETTINGS_KEYS.MIN_PASSWORD_LENGTH, 'Min Password Length'],
                      [SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES, 'Session Timeout (min)'],
                      [SETTINGS_KEYS.MAX_LOGIN_ATTEMPTS, 'Max Login Attempts'],
                      [SETTINGS_KEYS.COOLDOWN_MINUTES, 'Cooldown (minutes)'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>{label}</label>
                        <input type="number" value={settings[key]} onChange={e => update(key, parseInt(e.target.value) || DEFAULTS[key])}
                          style={{ ...inputStyle, borderColor: validationErrors[key] ? '#F09595' : '#0a3d22' }}
                          min={VALIDATION[key]?.min} max={VALIDATION[key]?.max} />
                        {validationErrors[key] && <span style={{ fontSize: '11px', color: '#F09595' }}>{validationErrors[key]}</span>}
                      </div>
                    ))}
                  </div>
                  <ToggleRow label="Require Email Verification" value={settings.require_email_verification} onChange={v => update(SETTINGS_KEYS.REQUIRE_EMAIL_VERIFICATION, v)} />
                  <ToggleRow label="Require Age Verification (18+)" value={settings.require_age_verification} onChange={v => update(SETTINGS_KEYS.REQUIRE_AGE_VERIFICATION, v)} />
                  <ToggleRow label="Google OAuth Login" value={settings.google_oauth_enabled} onChange={v => update(SETTINGS_KEYS.GOOGLE_OAUTH_ENABLED, v)} />
                </div>
              </div>
            )}

            {/* FEATURES */}
            {activeSection === 'features' && (
              <div>
                <h3 style={{ color: '#f59e0b', fontSize: '15px', margin: '0 0 1rem' }}>Feature Toggles</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <ToggleRow label="The Circle (Anonymous Chat)" desc="Peer support rooms" value={settings.circle_enabled} onChange={v => update(SETTINGS_KEYS.CIRCLE_ENABLED, v)} />
                  <ToggleRow label="Whispers (Peer Matching)" desc="1-on-1 anonymous chats" value={settings.whispers_enabled} onChange={v => update(SETTINGS_KEYS.WHISPERS_ENABLED, v)} />
                  <ToggleRow label="Family Portal" desc="Supporter invitations & oversight" value={settings.family_portal_enabled} onChange={v => update(SETTINGS_KEYS.FAMILY_PORTAL_ENABLED, v)} />
                  <ToggleRow label="Precious Pact" desc="Audio messages to future self" value={settings.precious_pact_enabled} onChange={v => update(SETTINGS_KEYS.PRECIOUS_PACT_ENABLED, v)} />
                  <ToggleRow label="Monthly Mirror" desc="Video reflection recordings" value={settings.monthly_mirror_enabled} onChange={v => update(SETTINGS_KEYS.MONTHLY_MIRROR_ENABLED, v)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '14px' }}>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Supporters Per User</label>
                    <input type="number" value={settings.max_supporters_per_user} onChange={e => update(SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER, parseInt(e.target.value) || DEFAULTS[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER])}
                      style={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER] ? '#F09595' : '#0a3d22' }} min="1" max="10" />
                    {validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER] && <span style={{ fontSize: '11px', color: '#F09595' }}>{validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER]}</span>}
                  </div>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Message Retention (days)</label>
                    <input type="number" value={settings.message_retention_days} onChange={e => update(SETTINGS_KEYS.MESSAGE_RETENTION_DAYS, parseInt(e.target.value) || DEFAULTS[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS])}
                      style={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS] ? '#F09595' : '#0a3d22' }} min="7" max="365" />
                    {validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS] && <span style={{ fontSize: '11px', color: '#F09595' }}>{validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS]}</span>}
                    <p style={{ color: '#3b7a5a', fontSize: '10px', marginTop: '4px' }}>Messages older than this are automatically deleted.</p>
                  </div>
                </div>
              </div>
            )}

            {/* PRICING */}
            {activeSection === 'pricing' && (
              <div>
                <h3 style={{ color: '#f59e0b', fontSize: '15px', margin: '0 0 1rem' }}>Pricing</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Premium Price (KES/month)</label>
                    <input type="number" value={settings.premium_price_kes} onChange={e => update(SETTINGS_KEYS.PREMIUM_PRICE_KES, parseInt(e.target.value) || DEFAULTS[SETTINGS_KEYS.PREMIUM_PRICE_KES])}
                      style={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES] ? '#F09595' : '#0a3d22' }} min="100" />
                    {validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES] && <span style={{ fontSize: '11px', color: '#F09595' }}>{validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES]}</span>}
                  </div>
                  <div>
                    <label style={{ color: '#6ee7b7', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Free Plan Diary Limit</label>
                    <input type="number" value={settings.free_plan_diary_limit} onChange={e => update(SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT, parseInt(e.target.value) || DEFAULTS[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT])}
                      style={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT] ? '#F09595' : '#0a3d22' }} min="1" max="30" />
                    {validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT] && <span style={{ fontSize: '11px', color: '#F09595' }}>{validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT]}</span>}
                  </div>
                </div>
              </div>
            )}

            {/* INTEGRATIONS */}
            {activeSection === 'integrations' && (
              <div>
                <h3 style={{ color: '#f59e0b', fontSize: '15px', margin: '0 0 1rem' }}>Integrations</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <ToggleRow label="M-Pesa Payments" desc="Mobile money for premium subscriptions" value={settings.mpesa_enabled} onChange={v => update(SETTINGS_KEYS.MPESA_ENABLED, v)} />
                  <ToggleRow label="SMS Crisis Alerts" desc="Send SMS via Twilio for urgent escalations" value={settings.sms_alerts_enabled} onChange={v => update(SETTINGS_KEYS.SMS_ALERTS_ENABLED, v)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}
      {showConfirm === 'maintenance' && (
        <div onClick={() => setShowConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #F09595', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>{'\u{26A0}'}</span>
            <h3 style={{ color: '#F09595', fontSize: '16px', margin: '0 0 8px' }}>Enable Maintenance Mode?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              All non-admin users will be locked out of the platform immediately.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={doSave} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#791F1F', border: 'none', color: '#F09595', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Enable</button>
            </div>
          </div>
        </div>
      )}

      {showConfirm === 'signups' && (
        <div onClick={() => setShowConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,31,19,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} style={{ background: '#062616', borderRadius: '16px', padding: '2rem', border: '1px solid #FAC775', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>{'\u{1F6AB}'}</span>
            <h3 style={{ color: '#FAC775', fontSize: '16px', margin: '0 0 8px' }}>Disable New Signups?</h3>
            <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              New users will not be able to create accounts. Existing users can still log in.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
              <button onClick={doSave} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#633806', border: 'none', color: '#f59e0b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Disable</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
