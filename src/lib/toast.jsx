let toastContainer = null
let styleInjected = false

function getContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.id = 'toast-container'
  toastContainer.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    z-index: var(--z-toast); display: flex; flex-direction: column; align-items: center;
    gap: 8px; pointer-events: none;
  `
  document.body.appendChild(toastContainer)
  return toastContainer
}

function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes toastSlideOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  `
  document.head.appendChild(style)
}

export function showToast(message, options = {}) {
  const { duration = 3000, type = 'success' } = options

  injectStyles()
  const container = getContainer()
  const toast = document.createElement('div')

  const bg = type === 'error' ? 'rgba(255,255,255,0.08)' : type === 'warning' ? 'rgba(45,212,191,0.15)' : '#7DBDEE'
  const color = type === 'error' ? '#FFFFFF' : type === 'warning' ? '#7DBDEE' : '#2DD4BF'
  const border = type === 'error' ? '#FFFFFF' : type === 'warning' ? '#2DD4BF' : 'rgba(255,255,255,0.4)'

  toast.textContent = message
  toast.style.cssText = `
    background: ${bg}; color: ${color}; padding: 10px 20px;
    border-radius: 100px; font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 16px rgba(11,18,32,0.4); border: 1px solid ${border};
    animation: toastSlideIn 0.3s ease-out; white-space: nowrap;
    pointer-events: auto; cursor: pointer;
    font-family: var(--font-body);
  `

  container.appendChild(toast)

  const remove = () => {
    toast.style.animation = 'toastSlideOut 0.3s ease-in forwards'
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast)
    }, 300)
  }

  const timer = setTimeout(remove, duration)
  toast.addEventListener('click', () => {
    clearTimeout(timer)
    remove()
  })
}
