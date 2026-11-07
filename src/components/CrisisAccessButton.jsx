import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Phone, Wind, X } from 'lucide-react'

const EXERCISE_SECONDS = 60

export default function CrisisAccessButton() {
  const [open, setOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!secondsLeft) return undefined
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  const breathingPhase = secondsLeft === 0
    ? 'Ready when you are'
    : Math.floor((EXERCISE_SECONDS - secondsLeft) % 8) < 4
      ? 'Breathe in'
      : 'Breathe out'

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
        <span>Need help now</span>
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
                <p className="crisis-access__eyebrow">Support is available</p>
                <h2 id="crisis-access-title">You do not have to face this alone</h2>
              </div>
              <button type="button" className="crisis-access__close" onClick={() => setOpen(false)} aria-label="Close support panel">
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="crisis-access__contacts">
              <a href="tel:+254722178177"><Phone size={17} aria-hidden="true" /><span><strong>Befrienders Kenya</strong><small>+254 722 178 177</small></span></a>
              <a href="tel:1192"><Phone size={17} aria-hidden="true" /><span><strong>NACADA</strong><small>1192</small></span></a>
            </div>
            <div className="crisis-access__breathing">
              <Wind size={20} aria-hidden="true" />
              <div aria-live="polite">
                <strong>{breathingPhase}</strong>
                <small>{secondsLeft ? `${secondsLeft} seconds remaining` : 'Try a gentle one-minute breathing pause.'}</small>
              </div>
              <button type="button" onClick={() => setSecondsLeft(EXERCISE_SECONDS)}>
                {secondsLeft ? 'Restart' : 'Start'}
              </button>
            </div>
            <Link className="crisis-access__toolkit" to="/urge-toolkit" onClick={() => setOpen(false)}>
              Open Urge Toolkit
            </Link>
            <p className="crisis-access__emergency">If you are in immediate danger, contact local emergency services or someone you trust.</p>
          </section>
        </div>
      )}
    </>
  )
}
