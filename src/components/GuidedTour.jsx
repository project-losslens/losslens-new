import { useEffect, useState } from 'react'

// Lightweight guided tour: highlights elements marked with data-tour and
// shows a tooltip card. No dependencies.
export default function GuidedTour({ steps, open, onClose, storageKey }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const current = steps[step]
    if (!current) return undefined
    const el = document.querySelector(current.target)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    const timer = window.setTimeout(() => {
      const target = document.querySelector(current.target)
      setRect(target ? target.getBoundingClientRect() : null)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [open, step, steps])

  if (!open || !steps[step]) return null
  const current = steps[step]
  const last = step === steps.length - 1

  const finish = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, 'done') } catch { /* ignore */ }
    }
    onClose?.()
  }

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect && (
        <div
          className="tour-highlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="tour-card">
        <p className="portal-page__eyebrow">Step {step + 1} of {steps.length}</p>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="btn-ghost" onClick={finish}>Skip tour</button>
          {step > 0 && <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)}>Back</button>}
          {last
            ? <button type="button" className="btn-primary" onClick={finish}>Done</button>
            : <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>Next</button>}
        </div>
      </div>
    </div>
  )
}
