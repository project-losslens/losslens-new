import NumberField from '../../components/NumberField'
import { toast } from '../../components/ToastProvider'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { BrandLoader } from '../../components/Brand'
import AppIcon from '../../components/AppIcon'

//  Constants
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
  [SETTINGS_KEYS.APP_NAME]: 'LossLens',
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
  { id: 'general', label: 'General', icon: '' },
  { id: 'security', label: 'Security', icon: '' },
  { id: 'features', label: 'Features', icon: '' },
  { id: 'pricing', label: 'Pricing', icon: '' },
  { id: 'integrations', label: 'Integrations', icon: '' },
]


export default function SystemSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({ ...DEFAULTS })
  const [originalSettings, setOriginalSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('general')
  const [showConfirm, setShowConfirm] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

  //  Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!originalSettings) return false
    return Object.keys(settings).some(key => settings[key] !== originalSettings[key])
  }, [settings, originalSettings])

  //  Warn on unsaved changes
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
    if (!validateAll()) { toast.error('Fix validation errors before saving.'); return }

    //  Confirmation for critical changes
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
      toast.success('Settings saved successfully!')
    } catch (err) { toast.error('Failed to save settings.') }
    setSaving(false)
  }

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setValidationErrors(prev => ({ ...prev, [key]: undefined }))
  }

  const resetToDefault = (key) => {
    if (DEFAULTS[key] !== undefined) {
      update(key, DEFAULTS[key])
      toast.success('Reset to default.')
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }

  const ToggleRow = ({ label, desc, value, onChange }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
      <div>
        <span style={{ color: 'var(--info)', fontSize: '13px' }}>{label}</span>
        {desc && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '2px 0 0' }}>{desc}</p>}
      </div>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }} />
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `loadingDot 1.2s ${i*0.2}s infinite` }} />)}
            </div>
            <BrandLoader variant="section" />
          </div>
        </div>
        <style>{`@keyframes loadingDot { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-10px);opacity:1} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
  
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="page-content">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            <button onClick={fetchSettings} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--text)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Retry</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}>System Settings</h1>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>
              Platform configuration{hasUnsavedChanges ? '  · Unsaved changes' : ''}
            </p>
          </div>
          <button onClick={saveSettings} disabled={saving || !hasUnsavedChanges}
            style={{ padding: '10px 24px', borderRadius: '100px', border: 'none', background: hasUnsavedChanges ? 'var(--primary)' : 'rgba(255,255,255,0.12)', color: hasUnsavedChanges ? 'var(--bg)' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: 600, cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>

        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.12)', overflowX: 'auto' }}>
            {SECTION_TABS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeSection === s.id ? 'rgba(45,212,191,0.15)' : 'transparent', color: activeSection === s.id ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: activeSection === s.id ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', minWidth: '80px', transition: 'background 0.2s, color 0.2s' }}>{s.label}</button>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '20px' }}>
            {/* GENERAL */}
            {activeSection === 'general' && (
              <div>
                <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}>General Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>App Name</label>
                      <input type="text" value={settings.app_name} onChange={e => update(SETTINGS_KEYS.APP_NAME, e.target.value)} style={inputStyle} />
                    </div>
                    <button onClick={() => resetToDefault(SETTINGS_KEYS.APP_NAME)} style={{ padding: '10px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
                  </div>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Support Email</label>
                    <input type="email" value={settings.support_email} onChange={e => update(SETTINGS_KEYS.SUPPORT_EMAIL, e.target.value)} style={inputStyle} placeholder="support@precious.app" />
                  </div>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Crisis Alert Email</label>
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
                <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}>Security & Access</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {[
                      [SETTINGS_KEYS.MIN_PASSWORD_LENGTH, 'Min Password Length'],
                      [SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES, 'Session Timeout (min)'],
                      [SETTINGS_KEYS.MAX_LOGIN_ATTEMPTS, 'Max Login Attempts'],
                      [SETTINGS_KEYS.COOLDOWN_MINUTES, 'Cooldown (minutes)'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>{label}</label>
                        <NumberField value={settings[key]} onChange={(value) => update(key, value ?? DEFAULTS[key])}
                          wrapperStyle={{ ...inputStyle, borderColor: validationErrors[key] ? 'var(--text)' : 'rgba(255,255,255,0.12)' }}
                          inputMode="numeric" min={VALIDATION[key]?.min} max={VALIDATION[key]?.max} step={1} />
                        {validationErrors[key] && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{validationErrors[key]}</span>}
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
                <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}>Feature Toggles</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <ToggleRow label="The Circle (Anonymous Chat)" desc="Peer support rooms" value={settings.circle_enabled} onChange={v => update(SETTINGS_KEYS.CIRCLE_ENABLED, v)} />
                  <ToggleRow label="Whispers (Peer Matching)" desc="1-on-1 anonymous chats" value={settings.whispers_enabled} onChange={v => update(SETTINGS_KEYS.WHISPERS_ENABLED, v)} />
                  <ToggleRow label="Family Portal" desc="Supporter invitations & oversight" value={settings.family_portal_enabled} onChange={v => update(SETTINGS_KEYS.FAMILY_PORTAL_ENABLED, v)} />
                  <ToggleRow label="LossLens Pact" desc="Audio messages to future self" value={settings.precious_pact_enabled} onChange={v => update(SETTINGS_KEYS.PRECIOUS_PACT_ENABLED, v)} />
                  <ToggleRow label="Monthly Mirror" desc="Video reflection recordings" value={settings.monthly_mirror_enabled} onChange={v => update(SETTINGS_KEYS.MONTHLY_MIRROR_ENABLED, v)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '14px' }}>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Supporters Per User</label>
                    <NumberField value={settings.max_supporters_per_user} onChange={(value) => update(SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER, value ?? DEFAULTS[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER])}
                      wrapperStyle={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER] ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} inputMode="numeric" min={1} max={10} step={1} />
                    {validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER] && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{validationErrors[SETTINGS_KEYS.MAX_SUPPORTERS_PER_USER]}</span>}
                  </div>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Message Retention (days)</label>
                    <NumberField value={settings.message_retention_days} onChange={(value) => update(SETTINGS_KEYS.MESSAGE_RETENTION_DAYS, value ?? DEFAULTS[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS])}
                      wrapperStyle={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS] ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} inputMode="numeric" min={7} max={365} step={1} />
                    {validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS] && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{validationErrors[SETTINGS_KEYS.MESSAGE_RETENTION_DAYS]}</span>}
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '4px' }}>Messages older than this are automatically deleted.</p>
                  </div>
                </div>
              </div>
            )}

            {/* PRICING */}
            {activeSection === 'pricing' && (
              <div>
                <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}>Pricing</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Premium Price (KES/month)</label>
                    <NumberField value={settings.premium_price_kes} onChange={(value) => update(SETTINGS_KEYS.PREMIUM_PRICE_KES, value ?? DEFAULTS[SETTINGS_KEYS.PREMIUM_PRICE_KES])}
                      wrapperStyle={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES] ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} inputMode="numeric" min={100} step={1} prefix="KES" />
                    {validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES] && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{validationErrors[SETTINGS_KEYS.PREMIUM_PRICE_KES]}</span>}
                  </div>
                  <div>
                    <label style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Free Plan Diary Limit</label>
                    <NumberField value={settings.free_plan_diary_limit} onChange={(value) => update(SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT, value ?? DEFAULTS[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT])}
                      wrapperStyle={{ ...inputStyle, borderColor: validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT] ? 'var(--text)' : 'rgba(255,255,255,0.12)' }} inputMode="numeric" min={1} max={30} step={1} />
                    {validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT] && <span style={{ fontSize: '11px', color: 'var(--text)' }}>{validationErrors[SETTINGS_KEYS.FREE_PLAN_DIARY_LIMIT]}</span>}
                  </div>
                </div>
              </div>
            )}

            {/* INTEGRATIONS */}
            {activeSection === 'integrations' && (
              <div>
                <h3 style={{ color: 'var(--primary)', fontSize: '15px', margin: '0 0 1rem' }}>Integrations</h3>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--text)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>{<AppIcon name="alert" size={40} style={{display:"block",margin:"0 auto 12px"}} />}</span>
            <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 8px' }}>Enable Maintenance Mode?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              All non-admin users will be locked out of the platform immediately.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={doSave} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Enable</button>
            </div>
          </div>
        </div>
      )}

      {showConfirm === 'signups' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.9)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} role="dialog" aria-modal="true">
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={() => setShowConfirm(null)} />
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--info)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>{<AppIcon name="shield" size={40} style={{display:"block",margin:"0 auto 12px"}} />}</span>
            <h3 style={{ color: 'var(--info)', fontSize: '16px', margin: '0 0 8px' }}>Disable New Signups?</h3>
            <p style={{ color: 'var(--primary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              New users will not be able to create accounts. Existing users can still log in.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirm(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={doSave} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(45,212,191,0.15)', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Disable</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 768px) { .main-content { margin-left: 0 !important; } }`}</style>
    </div>
  )
}
