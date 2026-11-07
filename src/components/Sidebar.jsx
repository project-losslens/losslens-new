import { NavLink } from 'react-router-dom'
import AppIcon from './AppIcon'

function Sidebar({ items, brand, isMobile, drawerOpen, desktopOpen, onNavigate, onSignOut, isSuperAdmin, elevatedUnlocked }) {
  const expanded = isMobile ? drawerOpen : desktopOpen
  const normalItems = items.filter((item) => !item.section)
  const elevatedItems = items.filter((item) => item.section === 'elevated')

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
      {item.section === 'elevated' && !elevatedUnlocked && <AppIcon name="shield" size={15} className="sidebar__lock" />}
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
          <ul>{normalItems.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
          {isSuperAdmin && elevatedItems.length > 0 && (
            <section className="sidebar__section" aria-label="Elevated">
              <h2>Elevated</h2>
              <ul>{elevatedItems.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
            </section>
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

export default Sidebar
