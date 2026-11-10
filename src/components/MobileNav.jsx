import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import AppIcon from './AppIcon'
import { mobileTabs, userNavGroups } from '../config/nav.config'

// Mobile bottom bar for the user role: Home, Diary, Help, Community, More.
// "More" opens a bottom sheet with the remaining destinations + sign out.
export default function MobileNav({ onSignOut }) {
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
