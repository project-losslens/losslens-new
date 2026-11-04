let toastContainer = null
let styleInjected = false

function getContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.id = 'toast-container'
  toastContainer.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    z-index: 9999; display: flex; flex-direction: column; align-items: center;
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

  const bg = type === 'error' ? '#791F1F' : type === 'warning' ? '#633806' : '#1d5c38'
  const color = type === 'error' ? '#F09595' : type === 'warning' ? '#FAC775' : '#6ee7b7'
  const border = type === 'error' ? '#F09595' : type === 'warning' ? '#f59e0b' : '#3b7a5a'

  toast.textContent = message
  toast.style.cssText = `
    background: ${bg}; color: ${color}; padding: 10px 20px;
    border-radius: 100px; font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 1px solid ${border};
    animation: toastSlideIn 0.3s ease-out; white-space: nowrap;
    pointer-events: auto; cursor: pointer;
    font-family: 'Inter', sans-serif;
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
