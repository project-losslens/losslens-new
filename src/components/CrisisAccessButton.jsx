import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Phone, Wind, X } from 'lucide-react'
import { HELPLINES } from '../config/helplines'
import { useI18n } from '../i18n'

const EXERCISE_SECONDS = 60

export default function CrisisAccessButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!secondsLeft) return undefined
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  const breathingPhase = secondsLeft === 0
    ? t('help.breathingReady')
    : Math.floor((EXERCISE_SECONDS - secondsLeft) % 8) < 4
      ? t('help.breatheIn')
      : t('help.breatheOut')

  return (
    <>
      <button
        className="crisis-access__trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <HeartHandshake size={18} aria-hidden="true" />
        <span>{t('help.needNow')}</span>
      </button>
      {open && (
        <div className="crisis-access__backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <section
            className="crisis-access__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crisis-access-title"
          >
            <header className="crisis-access__header">
              <div>
                <p className="crisis-access__eyebrow">{t('help.supportAvailable')}</p>
                <h2 id="crisis-access-title">{t('help.title')}</h2>
              </div>
              <button type="button" className="crisis-access__close" onClick={() => setOpen(false)} aria-label={t('help.close')}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="crisis-access__contacts">
              {HELPLINES.map((line) => (
                <a key={line.id} href={`tel:${line.tel}`}><Phone size={17} aria-hidden="true" /><span><strong>{line.name}</strong><small>{line.phone} · {line.hours}</small></span></a>
              ))}
            </div>
            <div className="crisis-access__breathing">
              <Wind size={20} aria-hidden="true" />
              <div aria-live="polite">
                <strong>{breathingPhase}</strong>
                <small>{secondsLeft ? t('help.secondsLeft', { count: secondsLeft }) : t('help.breathingHint')}</small>
              </div>
              <button type="button" onClick={() => setSecondsLeft(EXERCISE_SECONDS)}>
                {secondsLeft ? t('help.restart') : t('help.start')}
              </button>
            </div>
            <div className="crisis-access__actions">
              <Link className="crisis-access__toolkit" to="/urge-toolkit" onClick={() => setOpen(false)}>
                {t('help.toolkit')}
              </Link>
              <Link className="crisis-access__toolkit" to="/family-portal" onClick={() => setOpen(false)}>
                {t('help.supporter')}
              </Link>
              <Link className="crisis-access__toolkit" to="/dashboard" onClick={() => setOpen(false)}>
                {t('help.ai')}
              </Link>
            </div>
            <p className="crisis-access__emergency">{t('help.emergency')}</p>
          </section>
        </div>
      )}
    </>
  )
}
