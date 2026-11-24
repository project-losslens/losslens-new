import { useId } from 'react'
import AppIcon from './AppIcon'

export default function RecoveryDialog({ title, children, onClose }) {
  const titleId = useId()
  return <div className="pgsi-overlay">
    <button type="button" className="modal-backdrop" aria-label="Close self-check dialog" onClick={onClose} />
    <section className="pgsi-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="pgsi-dialog__header"><h2 id={titleId}>{title}</h2><button type="button" className="btn-ghost" onClick={onClose} aria-label="Close dialog"><AppIcon name="close" size={20} /></button></header>
      {children}
    </section>
  </div>
}