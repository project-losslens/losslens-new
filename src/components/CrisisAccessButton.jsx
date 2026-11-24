import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Wind, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { crisisReply } from '../lib/crisisSupport'
import SupportChoices from './SupportChoices'

const EXERCISE_SECONDS = 60
export default function CrisisAccessButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [safety, setSafety] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  useEffect(() => {
    const receive = event => {
      const detail = event.detail
      if (!detail?.requestId) return
      if (detail.open) { setSafety(detail); setOpen(true) }
      else setSafety(previous => previous?.requestId === detail.requestId ? { ...previous, ...detail } : previous)
    }
    window.addEventListener('losslens:crisis-support', receive)
    return () => window.removeEventListener('losslens:crisis-support', receive)
  }, [])
  useEffect(() => {
    if (!secondsLeft) return
    const timer = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])
  const breathingPhase = secondsLeft === 0 ? t('help.breathingReady')
    : Math.floor((EXERCISE_SECONDS - secondsLeft) % 8) < 4 ? t('help.breatheIn') : t('help.breatheOut')
  return <>
    <button className="crisis-access__trigger" type="button" onClick={() => { setSafety(null); setOpen(true) }} aria-haspopup="dialog" aria-expanded={open}>
      <HeartHandshake size={18} aria-hidden="true" /><span>{t('help.needNow')}</span>
    </button>
    {open && <div className="crisis-access__backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="crisis-access__sheet" role="dialog" aria-modal="true" aria-labelledby="crisis-access-title">
        <header className="crisis-access__header"><div>
          <p className="crisis-access__eyebrow">{t('help.supportAvailable')}</p>
          <h2 id="crisis-access-title">{safety?.target === 'self' ? 'Urgent human support' : safety?.target === 'other' ? 'Help someone you care about' : t('help.title')}</h2>
        </div><button type="button" className="crisis-access__close" onClick={() => setOpen(false)} aria-label={t('help.close')}><X size={20} aria-hidden="true" /></button></header>
        {safety && <div className="crisis-message" role="alert"><p>{crisisReply(safety.target)}</p>
          {safety.target === 'self' && <p>{safety.escalation === 'recorded'
            ? 'An internal support alert was recorded. This does not confirm that a person has seen it. Please contact a service directly.'
            : 'A human alert has not been confirmed. Please contact urgent help directly.'}</p>}
        </div>}
        <p className="crisis-access__emergency">{t('help.emergency')}</p>
        <SupportChoices />
        <div className="crisis-access__breathing"><Wind size={20} aria-hidden="true" /><div aria-live="polite"><strong>{breathingPhase}</strong><small>{secondsLeft ? t('help.secondsLeft', { count: secondsLeft }) : t('help.breathingHint')}</small></div><button type="button" onClick={() => setSecondsLeft(EXERCISE_SECONDS)}>{secondsLeft ? t('help.restart') : t('help.start')}</button></div>
        <div className="crisis-access__actions"><Link className="crisis-access__toolkit" to="/urge-toolkit" onClick={() => setOpen(false)}>{t('help.toolkit')}</Link></div>
      </section>
    </div>}
  </>
}