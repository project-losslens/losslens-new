import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import MobileNav from '../components/MobileNav'
import CommunityTabs from '../components/CommunityTabs'
import AppIcon from '../components/AppIcon'
import UserAvatar from '../components/UserAvatar'
import CrisisAccessButton from '../components/CrisisAccessButton'
import { useAuthProfile } from '../context/AuthProfileContext'
import { useMediaQuery } from '../hooks'
import { adminNav, communityPaths, getPageTitle, insurerNav, superAdminNav, therapistNav, userNav, userNavGroups } from '../config/nav.config'
import { useCrisisAlertCount } from '../context/CrisisAlertCountContext'
import { clearAuthStorage, supabase } from '../lib/supabase'
import { startOfflineSync } from '../lib/offlineSync'
import { useI18n } from '../i18n'

export default function AppShell({ admin = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { isSuperAdmin, role, username, avatar_url: avatarReference } = useAuthProfile()
  const { t } = useI18n()
  const openCrisisAlerts = useCrisisAlertCount()
  const [desktopOpen, setDesktopOpen] = useState(() => localStorage.getItem('losslens:sidebar') !== 'closed')
  const [drawerForLocation, setDrawerForLocation] = useState(null)
  const drawerOpen = isMobile && drawerForLocation === location.key
  const portalNav = role === 'therapist' ? therapistNav : role === 'insurer' ? insurerNav : null
  const isUserRole = !admin && !portalNav
  const activeNav = admin
    ? [...adminNav, ...(isSuperAdmin ? superAdminNav : [])]
    : portalNav || userNav
  const items = activeNav
    .map((item) => item.to === '/admin/crisis'
      ? { ...item, badge: openCrisisAlerts > 0 ? openCrisisAlerts : null }
      : item)

  useEffect(() => {
    window.setTimeout(() => mainRef.current?.focus(), 0)
  }, [location.pathname])

  useEffect(() => startOfflineSync(), [])

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

  const toggleDesktop = () => {
    setDesktopOpen((open) => {
      localStorage.setItem('losslens:sidebar', open ? 'closed' : 'open')
      return !open
    })
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    clearAuthStorage()
    if (error) {
      console.error('Sign-out failed:', error)
    }
    navigate('/login', { replace: true })
  }

  const showCommunityTabs = isUserRole && communityPaths.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
  const accountName = username || t('shell.account')

  return (
    <div className={`shell${admin ? ' shell--admin' : ''}${isUserRole && isMobile ? ' shell--mobile-nav' : ''}`} style={{ '--sidebar-w': !isMobile && desktopOpen ? '240px' : '0px' }}>
      <a className="shell__skip" href="#main-content">{t('shell.skipToContent')}</a>
      {!(isUserRole && isMobile) && (
        <Sidebar
          items={items}
          groups={isUserRole && !isMobile ? userNavGroups : null}
          brand={admin ? 'LossLens Admin' : 'LossLens'}
          isMobile={isMobile}
          drawerOpen={drawerOpen}
          desktopOpen={desktopOpen}
          onNavigate={() => setDrawerForLocation(null)}
          onSignOut={handleSignOut}
        />
      )}
      <main className="shell__main" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="shell__header">
          <div className="shell__header-leading">
            {!(isUserRole && isMobile) && (
              <button
                type="button"
                className="shell__toggle"
                aria-expanded={isMobile ? drawerOpen : desktopOpen}
                aria-controls="app-sidebar"
                aria-label={isMobile ? (drawerOpen ? t('shell.closeMenu') : t('shell.openMenu')) : (desktopOpen ? t('shell.collapseSidebar') : t('shell.expandSidebar'))}
                onClick={() => isMobile
                  ? setDrawerForLocation(drawerOpen ? null : location.key)
                  : toggleDesktop()}
              >
                <AppIcon name={isMobile && drawerOpen ? 'close' : 'menu'} size={21} />
                <span className="visually-hidden">{isMobile ? t('shell.toggleNav') : t('shell.toggleSidebar')}</span>
              </button>
            )}
            <h1>{getPageTitle(location.pathname)}</h1>
          </div>
          <div className="shell__header-actions">
            {admin && <Link className="shell__back-link" to="/dashboard">{t('shell.backToApp')}</Link>}
            <details className="shell__account">
              <summary>
                <UserAvatar reference={avatarReference} name={accountName} className="shell__account-avatar" size={34} />
                <span className="shell__account-name">{accountName}</span>
              </summary>
              <div className="shell__account-menu">
                <div className="shell__account-menu-profile">
                  <UserAvatar reference={avatarReference} name={accountName} size={36} />
                  <span>{accountName}</span>
                </div>
                <Link to="/profile">{t('shell.profile')}</Link>
                <button type="button" onClick={handleSignOut}>{t('shell.signOut')}</button>
              </div>
            </details>
          </div>
        </header>
        <div className="shell__content">
          {showCommunityTabs && <CommunityTabs />}
          <Outlet />
        </div>
      </main>
      {isUserRole && isMobile && <MobileNav onSignOut={handleSignOut} />}
      <CrisisAccessButton />
    </div>
  )
}
