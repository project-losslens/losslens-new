import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useId } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { userNav } from '../config/nav.config'
import { useAuthProfile } from './AuthProfileContext'
import { supabase } from '../lib/supabase'
import { claimLoginReminder, pgsiBand, PGSI_EXPLANATIONS, pgsiPercentage } from '../lib/pgsi'
import PgsiAssessment from '../components/PgsiAssessment'
import SupportChoices from '../components/SupportChoices'
import AppIcon from '../components/AppIcon'

const Context = createContext(null)
const EMPTY = { latest: null, due: false, loaded: false, personalization_enabled: false, error: '' }
export function PgsiProvider({ children }) {
  const { user, role, authStatus, loginKey } = useAuthProfile()
  const location = useLocation(), navigate = useNavigate()
  const enabled = authStatus === 'ready' && role === 'user'
  const owner = enabled && loginKey ? `${user.id}:${loginKey}` : null
  const activeOwner = useRef(null)
  const [record, setRecord] = useState(EMPTY)
  const [dialog, setDialog] = useState(null)
  const [support, setSupport] = useState(null)
  const [reminder, setReminder] = useState(null)
  const current = record.owner === owner && owner ? record : EMPTY
  useEffect(() => { activeOwner.current = owner; return () => { activeOwner.current = null } }, [owner])
  const refresh = useCallback(async () => {
    if (!owner) return
    try {
      const { data, error } = await supabase.rpc('pgsi_latest')
      if (error || !data || typeof data.due !== 'boolean' || typeof data.personalization_enabled !== 'boolean') throw new Error('Unavailable')
      if (data.latest && (data.latest.band !== pgsiBand(data.latest.raw_score) || !Number.isFinite(Date.parse(data.latest.completed_at)))) throw new Error('Invalid result')
      if (activeOwner.current === owner) setRecord({ ...data, owner, loaded: true, error: '' })
    } catch {
      if (activeOwner.current === owner) setRecord({ owner, ...EMPTY, error: 'Your self-check could not be loaded. Please retry.' })
    }
  }, [owner])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  useEffect(() => {
    if (!owner) return
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [owner, refresh])
  useEffect(() => {
    if (!owner || !current.loaded || !userNav.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))) return
    let cancelled = false
    const claim = () => {
      if (cancelled) return
      try {
        if (claimLoginReminder(localStorage, user.id, loginKey, current.due)) setReminder(owner)
      } catch { /* Storage restrictions must not block access to the assessment card. */ }
    }
    const evaluate = async () => {
      if (navigator.locks) await navigator.locks.request(`pgsi-reminder:${user.id}`, claim)
      else claim()
    }
    void evaluate()
    return () => { cancelled = true }
  }, [owner, current.loaded, current.due, location.pathname, user?.id, loginKey])
  const dismissReminder = useCallback(() => {
    if (owner) { try { claimLoginReminder(localStorage, user.id, loginKey, false) } catch { /* session persistence may be unavailable */ } }
    setReminder(null)
  }, [owner, user, loginKey])
  const startAssessment = useCallback(() => { dismissReminder(); setDialog({ owner, type: 'assessment' }) }, [dismissReminder, owner])
  const acceptAssessment = useCallback((result, after = null) => {
    if (activeOwner.current !== owner) return
    setRecord(previous => ({ ...previous, owner, loaded: true, error: '', due: false, latest: result }))
    setReminder(null); setDialog(null)
    if (result.raw_score >= 8) setSupport({ owner, qualifying: true, after })
    else if (after) after()
  }, [owner])
  const setPersonalization = useCallback(async value => {
    const { data, error } = await supabase.rpc('pgsi_set_personalization', { p_enabled: value })
    if (error || data?.enabled !== value) throw new Error('Your choice could not be saved. Please retry.')
    if (activeOwner.current === owner) setRecord(previous => ({ ...previous, personalization_enabled: data.enabled }))
  }, [owner])
  const showResources = useCallback(() => setSupport({ owner, qualifying: false, after: null }), [owner])
  const closeSupport = () => { const after = support?.after; setSupport(null); if (after) after(); else navigate('/dashboard') }
  const value = useMemo(() => ({ ...current, refresh, startAssessment, acceptAssessment, dismissReminder, setPersonalization, showResources,
    knowMore: () => setDialog({ owner, type: 'result' }),
  }), [current, refresh, startAssessment, acceptAssessment, dismissReminder, setPersonalization, showResources, owner])
  return <Context.Provider value={value}>
    {children}
    {owner && reminder === owner && <RecoveryDialog title={current.latest ? 'Your self-check is due' : 'Take your first self-check'} onClose={dismissReminder}>
      <p>{current.latest ? 'Seven full days have passed since your last successful self-check.' : 'You have not completed a PGSI self-check yet. Your previous ratings have not been converted into a PGSI score.'}</p>
      <p>The questions still cover the past 12 months. Repeating them is a chance to reflect; overlapping results do not prove weekly change.</p>
      <div className="pgsi-actions"><button type="button" className="btn-primary" onClick={startAssessment}>Take self-check</button><button type="button" className="btn-ghost" onClick={dismissReminder}>Remind me later</button></div>
    </RecoveryDialog>}
    {owner && dialog?.owner === owner && <RecoveryDialog title={dialog.type === 'result' ? 'Know more about your PGSI result' : 'Your PGSI self-check'} onClose={() => setDialog(null)}>
      {dialog.type === 'assessment' ? <PgsiAssessment onCompleted={acceptAssessment} /> : current.latest && <PgsiResult result={current.latest} />}
    </RecoveryDialog>}
    {owner && support?.owner === owner && <RecoveryDialog title="Support options" onClose={closeSupport}>
      {support.qualifying && <p>Your answers suggest gambling may be affecting your life. Would you like to talk to someone?</p>}
      <SupportChoices />
      <div className="pgsi-actions"><button type="button" className="btn-primary" onClick={closeSupport}>Continue to dashboard</button><button type="button" className="btn-ghost" onClick={closeSupport}>Not now</button></div>
    </RecoveryDialog>}
  </Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function usePgsi() {
  const context = useContext(Context)
  if (!context) throw new Error('usePgsi requires PgsiProvider')
  return context
}

function RecoveryDialog({ title, children, onClose }) {
  const titleId = useId()
  return <div className="pgsi-overlay">
    <button type="button" className="modal-backdrop" aria-label="Close self-check dialog" onClick={onClose} />
    <section className="pgsi-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="pgsi-dialog__header"><h2 id={titleId}>{title}</h2><button type="button" className="btn-ghost" onClick={onClose} aria-label="Close dialog"><AppIcon name="close" size={20} /></button></header>
      {children}
    </section>
  </div>
}

function PgsiResult({ result }) {
  return <div className="pgsi-result">
    <p><strong>{pgsiPercentage(result.raw_score)}% of maximum: {result.raw_score}/27 points</strong></p>
    <p>Completed {new Date(result.completed_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} (Nairobi time).</p>
    <p>{PGSI_EXPLANATIONS[result.band]}</p>
    <p>Your answers cover the past 12 months before this assessment. The percentage is your share of the 27 possible points. It is not a likelihood of addiction or a measure of how recovered you are.</p>
    <p>This self-check cannot diagnose a condition. Support is an option at any score, and you decide whether to use it.</p>
    <SupportChoices />
  </div>
}
