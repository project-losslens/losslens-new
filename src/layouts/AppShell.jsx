import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, Link, NavLink } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import UserAvatar from '../components/UserAvatar'
import { useAuthProfile } from '../context/AuthProfileContext'
import { useMediaQuery } from '../hooks'
import { adminNav, communityPaths, getPageTitle, insurerNav, superAdminNav, therapistNav, userNav, userNavGroups, mobileTabs } from '../config/nav.config'
import { useCrisisAlertCount } from '../context/CrisisAlertCountContext'
import { clearAuthStorage, supabase } from '../lib/supabase'
import { startOfflineSync } from '../lib/offlineSync'
import { useI18n } from '../i18n'
import TopographicBackground from '../components/TopographicBackground'
import { ProtectionIntroduction } from '../components/ProtectionWorkflow'

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
  const isUserRole = role === 'user'
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
      <TopographicBackground variant={admin ? 'admin' : 'app'} />
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
            {isUserRole && <Link className="protection-status-link" to="/protection-member">LossLens Protection</Link>}
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
                {isUserRole && <Link to="/profile">{t('shell.profile')}</Link>}
                <button type="button" onClick={handleSignOut}>{t('shell.signOut')}</button>
              </div>
            </details>
          </div>
        </header>
        <div className="shell__content">
          {showCommunityTabs && <CommunityTabs />}
          {isUserRole && <ProtectionIntroduction />}
          <Outlet />
        </div>
      </main>
      {isUserRole && isMobile && <MobileNav onSignOut={handleSignOut} />}

    </div>
  )
}

const COMMUNITY = userNavGroups.find((g) => g.title === 'Community')?.items || []

// Sub-tab bar shown on community routes (The Circle / Whispers / Events).
function CommunityTabs() {
  return (
    <nav className="community-tabs" aria-label="Community">
      {COMMUNITY.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `community-tabs__link${isActive ? ' community-tabs__link--active' : ''}`}
        >
          <AppIcon name={item.icon} size={16} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// Mobile bottom bar for the user role: Home, Diary, Help, Community, More.
// "More" opens a bottom sheet with the remaining destinations + sign out.
function MobileNav({ onSignOut }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreItems = userNavGroups.find((g) => g.title === 'More')?.items || []

  const isActive = (tab) => {
    if (tab.match) return tab.match.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
    return tab.end ? location.pathname === tab.to : location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`)
  }

  return (
    <>
      <nav className="mobile-nav" aria-label="Primary">
        {mobileTabs.map((tab) => {
          if (!tab.to) {
            return (
              <button
                key={tab.label}
                type="button"
                className={`mobile-nav__item${moreOpen ? ' mobile-nav__item--active' : ''}`}
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
              >
                <AppIcon name={tab.icon} size={22} />
                <span>{tab.label}</span>
              </button>
            )
          }
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={`mobile-nav__item${isActive(tab) ? ' mobile-nav__item--active' : ''}`}
              onClick={() => setMoreOpen(false)}
            >
              <AppIcon name={tab.icon} size={22} />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {moreOpen && (
        <div className="mobile-nav__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setMoreOpen(false) }}>
          <section className="mobile-nav__sheet" role="dialog" aria-modal="true" aria-label="More options">
            <button type="button" className="modal-backdrop" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
            <h2 className="mobile-nav__sheet-title">More</h2>
            <ul className="mobile-nav__list">
              {moreItems.map((item) => (
                <li key={item.to}>
                  <button
                    type="button"
                    className="mobile-nav__link"
                    onClick={() => { setMoreOpen(false); navigate(item.to) }}
                  >
                    <AppIcon name={item.icon} size={20} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {onSignOut && (
              <button type="button" className="mobile-nav__link mobile-nav__link--danger" onClick={() => { setMoreOpen(false); onSignOut() }}>
                <AppIcon name="logout" size={20} />
                <span>Sign out</span>
              </button>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function Sidebar({ items, groups, brand, isMobile, drawerOpen, desktopOpen, onNavigate, onSignOut }) {
  const { t } = useI18n()
  const expanded = isMobile ? drawerOpen : desktopOpen
  const normalItems = items.filter((item) => !item.section)
  const sections = [...new Set(items.filter((item) => item.section).map((item) => item.section))]

  const renderLink = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
      title={!expanded ? item.label : undefined}
    >
      <AppIcon name={item.icon} size={19} />
      <span>{item.label}</span>
      {item.badge && <span className="sidebar__badge" aria-label={`${item.badge} open alerts`}>{item.badge > 99 ? '99+' : item.badge}</span>}
    </NavLink>
  )

  return (
    <>
      {isMobile && drawerOpen && (
        <button className="shell__scrim" type="button" aria-label="Close navigation" onClick={onNavigate} />
      )}
      <aside
        id="app-sidebar"
        className={`sidebar${expanded ? ' sidebar--open' : ' sidebar--closed'}${isMobile ? ' sidebar--mobile' : ''}`}
        inert={!expanded}
        aria-label={`${brand} navigation`}
      >
        <NavLink className="sidebar__brand" to={items[0]?.to || '/'} onClick={onNavigate}>{brand}</NavLink>
        <nav className="sidebar__nav" aria-label="Primary">
          {groups ? (
            groups.map((group) => (
              <section key={group.title} className="sidebar__section" aria-label={group.title}>
                <h2>{group.title}</h2>
                <ul>{group.items.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
              </section>
            ))
          ) : (
            <>
              {brand.includes('Admin') && <h2 className="sidebar__section-title">Operations</h2>}
              <ul>{normalItems.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
              {sections.map((section) => (
                <section key={section} className="sidebar__section" aria-label={section === 'super-admin' ? t('nav.superAdminSection') : section}>
                  <h2>{section === 'super-admin' ? t('nav.superAdminSection') : section}</h2>
                  <ul>{items.filter((item) => item.section === section).map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
                </section>
              ))}
            </>
          )}
        </nav>
        <button className="sidebar__logout" type="button" onClick={onSignOut}>
          <AppIcon name="logout" size={19} />
          <span>Sign out</span>
        </button>
      </aside>
    </>
  )
}
