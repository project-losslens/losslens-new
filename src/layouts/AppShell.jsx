import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AppIcon from '../components/AppIcon'
import CrisisAccessButton from '../components/CrisisAccessButton'
import { useAuthProfile } from '../context/AuthProfileContext'
import useMediaQuery from '../hooks/useMediaQuery'
import { adminNav, getPageTitle, insurerNav, therapistNav, userNav } from '../config/nav.config'
import { useCrisisAlertCount } from '../context/CrisisAlertCountContext'
import { supabase } from '../lib/supabase'

const ELEVATED_UNLOCK_MS = 15 * 60 * 1000

function isElevatedUnlocked() {
  const unlockedAt = Number(sessionStorage.getItem('elevated_unlocked_at'))
  return Boolean(unlockedAt && Date.now() - unlockedAt < ELEVATED_UNLOCK_MS)
}

export default function AppShell({ admin = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { isSuperAdmin, role, user } = useAuthProfile()
  const openCrisisAlerts = useCrisisAlertCount()
  const [desktopOpen, setDesktopOpen] = useState(() => localStorage.getItem('losslens:sidebar') !== 'closed')
  const [drawerForLocation, setDrawerForLocation] = useState(null)
  const [elevatedUnlocked, setElevatedUnlocked] = useState(isElevatedUnlocked)
  const drawerOpen = isMobile && drawerForLocation === location.key
  const portalNav = role === 'therapist' ? therapistNav : role === 'insurer' ? insurerNav : null
  const activeNav = admin ? adminNav : portalNav || userNav
  const items = activeNav
    .filter((item) => !item.section || isSuperAdmin)
    .filter((item) => !item.superAdminOnly || isSuperAdmin)
    .map((item) => item.to === '/admin/crisis'
      ? { ...item, badge: openCrisisAlerts > 0 ? openCrisisAlerts : null }
      : item)

  useEffect(() => {
    window.setTimeout(() => mainRef.current?.focus(), 0)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobile || !drawerOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerForLocation(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobile, drawerOpen])

  useEffect(() => {
    const syncUnlock = () => setElevatedUnlocked(isElevatedUnlocked())
    window.addEventListener('storage', syncUnlock)
    window.addEventListener('elevated-access-change', syncUnlock)
    return () => {
      window.removeEventListener('storage', syncUnlock)
      window.removeEventListener('elevated-access-change', syncUnlock)
    }
  }, [])

  const toggleDesktop = () => {
    setDesktopOpen((open) => {
      localStorage.setItem('losslens:sidebar', open ? 'closed' : 'open')
      return !open
    })
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign-out failed:', error)
      return
    }
    sessionStorage.removeItem('elevated_unlocked_at')
    window.dispatchEvent(new Event('elevated-access-change'))
    navigate('/login', { replace: true })
  }

  return (
    <div className={`shell${admin ? ' shell--admin' : ''}`} style={{ '--sidebar-w': !isMobile && desktopOpen ? '240px' : '0px' }}>
      <a className="shell__skip" href="#main-content">Skip to content</a>
      <Sidebar
        items={items}
        brand={admin ? 'LossLens Admin' : 'LossLens'}
        isMobile={isMobile}
        drawerOpen={drawerOpen}
        desktopOpen={desktopOpen}
        onNavigate={() => setDrawerForLocation(null)}
        onSignOut={handleSignOut}
        isSuperAdmin={isSuperAdmin}
        elevatedUnlocked={elevatedUnlocked}
      />
      <button
        type="button"
        className={`shell__toggle${isMobile ? ' shell__toggle--mobile' : ''}`}
        aria-expanded={isMobile ? drawerOpen : desktopOpen}
        aria-controls="app-sidebar"
        aria-label={isMobile ? (drawerOpen ? 'Close menu' : 'Open menu') : (desktopOpen ? 'Collapse sidebar' : 'Expand sidebar')}
        onClick={() => isMobile
          ? setDrawerForLocation(drawerOpen ? null : location.key)
          : toggleDesktop()}
      >
        <AppIcon name={isMobile && drawerOpen ? 'close' : 'menu'} size={21} />
        <span className="visually-hidden">{isMobile ? 'Toggle navigation' : 'Toggle sidebar'}</span>
      </button>
      <main className="shell__main" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="shell__header">
          <h1>{getPageTitle(location.pathname)}</h1>
          <div className="shell__header-actions">
            {admin && <Link className="shell__back-link" to="/dashboard">Back to app</Link>}
            <details className="shell__account">
              <summary>{user?.email || 'Account'}</summary>
              <div className="shell__account-menu">
                <Link to="/profile">Profile</Link>
                <button type="button" onClick={handleSignOut}>Sign out</button>
              </div>
            </details>
          </div>
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </main>
      <CrisisAccessButton />
    </div>
  )
}
