import { NavLink } from 'react-router-dom'
import AppIcon from './AppIcon'
import { userNavGroups } from '../config/nav.config'

const COMMUNITY = userNavGroups.find((g) => g.title === 'Community')?.items || []

// Sub-tab bar shown on community routes (The Circle / Whispers / Events).
export default function CommunityTabs() {
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
