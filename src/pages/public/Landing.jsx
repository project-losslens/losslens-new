import { useEffect, useState } from 'react'
import { canShowInstall, showInstallPrompt } from '../../lib/pwa'
import { useDocumentTitle } from '../../hooks'
import { CallToAction, Crisis, HowItWorks, Privacy, PublicLayout, WhatYouGet, Hero } from './landing/Sections'

const INSTALL_DISMISSED_UNTIL = 'll_install_dismissed_until'
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000

function InstallToast() {
  const [available, setAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Number(localStorage.getItem(INSTALL_DISMISSED_UNTIL)) > Date.now()
    } catch (error) {
      console.error('Could not read install prompt preference:', error)
      return false
    }
  })
  const [crisisVisible, setCrisisVisible] = useState(false)

  useEffect(() => {
    const handleInstallAvailable = () => setAvailable(canShowInstall())
    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('appinstalled', handleInstallAvailable)
    handleInstallAvailable()
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleInstallAvailable)
    }
  }, [])

  useEffect(() => {
    const crisis = document.getElementById('crisis')
    if (!crisis || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setCrisisVisible(entry.isIntersecting))
    observer.observe(crisis)
    return () => observer.disconnect()
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(INSTALL_DISMISSED_UNTIL, String(Date.now() + FOURTEEN_DAYS))
    } catch (error) {
      console.error('Could not save install prompt preference:', error)
    }
  }

  const install = async () => {
    const installed = await showInstallPrompt()
    setAvailable(canShowInstall())
    if (installed) dismiss()
  }

  if (!available || dismissed || crisisVisible) return null

  return (
    <aside className="ll-install-toast" role="status" aria-label="Install LossLens">
      <p>Add LossLens to your home screen for quicker access.</p>
      <div>
        <button type="button" className="ll-install-toast__dismiss" onClick={dismiss}>Not now</button>
        <button type="button" className="ll-install-toast__install" onClick={install}>Install</button>
      </div>
    </aside>
  )
}

export default function Landing() {
  useDocumentTitle('Free, private gambling support for Kenya')

  return (
    <PublicLayout>
      <main>
        <Hero />
        <WhatYouGet />
        <HowItWorks />
        <Privacy />
        <CallToAction />
        <Crisis />
      </main>
      <InstallToast />
    </PublicLayout>
  )
}
