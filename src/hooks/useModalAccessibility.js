import { useEffect } from 'react'

// Shared behavior for the existing fixed overlays; inline chat consent is not a modal.
export function useModalAccessibility() {
  useEffect(() => {
    let active = null
    let previousFocus = null
    let previousOverflow = ''
    const candidates = () => [...document.querySelectorAll('.modal-backdrop, .crisis-access__backdrop')]
      .map(node => node.classList.contains('crisis-access__backdrop')
        ? { backdrop: node.querySelector('.crisis-access__close'), overlay: node, panel: node.querySelector('.crisis-access__sheet') }
        : { backdrop: node, overlay: node.parentElement, panel: node.nextElementSibling })
      .filter(item => item.panel && item.backdrop && getComputedStyle(item.overlay).position === 'fixed')
      .sort((a, b) => (Number(getComputedStyle(a.overlay).zIndex) || 0) - (Number(getComputedStyle(b.overlay).zIndex) || 0))
    const focusable = panel => [...panel.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'),
      ...(panel.classList.contains('pgsi-dialog') ? document.querySelectorAll('.crisis-access__trigger') : [])]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length)
    const sync = () => {
      const next = candidates().at(-1) || null
      if (next?.overlay === active?.overlay) return
      if (!active && next) {
        previousFocus = document.activeElement
        previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
      if (active && !next) {
        document.body.style.overflow = previousOverflow
        if (previousFocus?.isConnected) previousFocus.focus()
      }
      active = next
      if (active) {
        active.panel.setAttribute('role', 'dialog')
        active.panel.setAttribute('aria-modal', 'true')
        if (!active.panel.hasAttribute('aria-label') && !active.panel.hasAttribute('aria-labelledby')) {
          active.panel.setAttribute('aria-label', active.panel.querySelector('h2, h3')?.textContent || 'Dialog')
        }
        const first = focusable(active.panel)[0]
        first?.focus()
      }
    }
    const onKeyDown = event => {
      if (!active) return
      if (event.key === 'Escape') { event.preventDefault(); active.backdrop.click(); return }
      if (event.key !== 'Tab') return
      const items = focusable(active.panel)
      if (!items.length) { event.preventDefault(); return }
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', onKeyDown)
    sync()
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown)
      if (active) document.body.style.overflow = previousOverflow
    }
  }, [])
}
