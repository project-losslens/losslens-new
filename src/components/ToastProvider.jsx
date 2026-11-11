import { useCallback, useEffect, useState } from 'react'
import AppIcon from './AppIcon'
import { useI18n } from '../i18n'

const TOAST_EVENT = 'losslens:toast'

function publishToast(type, message, options) {
  if (typeof window === 'undefined') return
  const duration = typeof options === 'number' ? options : options?.duration
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: { id: `${Date.now()}-${Math.random()}`, type, message: String(message), duration: duration ?? 3000 },
  }))
}

export const toast = {
  success: (message, options) => publishToast('success', message, options),
  error: (message, options) => publishToast('error', message, options),
  info: (message, options) => publishToast('info', message, options),
}

function ToastItem({ item, onClose, closeLabel }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(item.id), item.duration)
    return () => window.clearTimeout(timer)
  }, [item, onClose])

  return (
    <div className={`ll-toast ll-toast--${item.type}`} role={item.type === 'error' ? 'alert' : 'status'}>
      <span className="ll-toast__message">{item.message}</span>
      <button type="button" className="ll-toast__close" onClick={() => onClose(item.id)} aria-label={closeLabel}>
        <AppIcon name="close" size={16} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const { t } = useI18n()

  useEffect(() => {
    const onToast = (event) => {
      const item = event.detail
      if (!item?.message) return
      setItems((current) => [...current.slice(-3), item])
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  const closeToast = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  return (
    <>
      {children}
      <div className="ll-toast-region" aria-live="polite" aria-relevant="additions text">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onClose={closeToast} closeLabel={t('common.dismiss')} />
        ))}
      </div>
    </>
  )
}
