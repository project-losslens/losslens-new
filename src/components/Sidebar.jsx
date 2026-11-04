import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false) // Changed from true to false
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  // Detect mobile screen
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close mobile menu on navigation, but don't collapse desktop sidebar
  useEffect(() => {
    setMobileOpen(false)
    // Only auto-collapse on mobile
    if (isMobile) {
      setCollapsed(true)
    }
  }, [location.pathname, isMobile])

  const menuItems = [
    { path: '/dashboard', icon: '🏠', label: 'Home', desc: 'Your dashboard' },
    { path: '/diary', icon: '📓', label: 'Diary', desc: 'Track your day' },
    { path: '/cbt', icon: '🧠', label: 'CBT Modules', desc: 'Learn & grow' },
    { path: '/urge-toolkit', icon: '🛠️', label: 'Urge Toolkit', desc: 'Beat urges' },
    { path: '/circle', icon: '💬', label: 'The Circle', desc: 'Anonymous peer support' },
    { path: '/whispers', icon: '🤝', label: 'Whispers', desc: '1:1 peer matching' },
    { path: '/events', icon: '📅', label: 'Events', desc: 'Support groups' },
    { path: '/resources', icon: '📞', label: 'Resources', desc: 'Get help' },
    { path: '/family-portal', icon: '👨‍👩‍👧', label: 'Family Portal', desc: 'Invite support' },
    { path: '/monthly-mirror', icon: '🪞', label: 'Monthly Mirror', desc: 'See progress' },
    { path: '/precious-pact', icon: '🤝', label: 'Precious Pact', desc: 'Future message' },
    { path: '/profile', icon: '👤', label: 'Profile', desc: 'Settings & data' },
    { path: '/subscription', icon: '💎', label: 'Subscription', desc: 'Plans & billing' },
    { path: '/logout', icon: '🚪', label: 'Logout', desc: 'Sign out' },
  ]

  const isActive = (path) => location.pathname === path

  const handleNav = async (path) => {
    if (path === '/logout') {
      await supabase.auth.signOut()
      navigate('/', { replace: true })
      return
    }
    navigate(path)
    if (isMobile) {
      setMobileOpen(false)
      setCollapsed(true)
    }
  }

  const closeAll = () => {
    setCollapsed(true)
    setMobileOpen(false)
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        className="mobile-hamburger"
        style={{
          background: '#062616',
          border: '1px solid #0a3d22',
          color: '#6ee7b7',
        }}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={closeAll}
          aria-hidden="true"
          className="sidebar-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(4, 31, 19, 0.8)', zIndex: 1050,
          }}
        />
      )}

      {/* Desktop toggle */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="desktop-toggle"
          style={{
            left: collapsed ? '16px' : '260px',
            background: '#062616',
            border: '1px solid #0a3d22',
            color: '#6ee7b7',
          }}
        >
          {collapsed ? '☰' : '◂'}
        </button>
      )}

      <nav
        aria-label="Main navigation"
        className="sidebar"
        style={{
          left: mobileOpen ? 0 : (collapsed && !isMobile) ? '-260px' : '0',
          background: '#062616',
          borderRight: '1px solid #0a3d22',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1rem',
            borderBottom: '1px solid #0a3d22',
            marginBottom: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '22px',
              color: '#f59e0b',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => handleNav('/dashboard')}
          >
            Precious
          </span>
        </div>

        <div role="menubar" style={{ flex: 1, padding: '0 0.5rem' }}>
          {menuItems.map((item) => (
            <button
              key={item.path}
              role="menuitem"
              aria-current={isActive(item.path) ? 'page' : undefined}
              onClick={() => handleNav(item.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                marginBottom: '2px',
                borderRadius: '8px',
                border: 'none',
                background: isActive(item.path) ? '#0a3d22' : 'transparent',
                color: item.path === '/logout' ? '#F09595' : isActive(item.path) ? '#f59e0b' : '#6ee7b7',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = '#041f13'
                  e.currentTarget.style.color = item.path === '/logout' ? '#F09595' : '#9fe1cb'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = item.path === '/logout' ? '#F09595' : '#6ee7b7'
                }
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: '18px',
                  width: '24px',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: isActive(item.path) ? 600 : 400,
                    fontSize: '13px',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: isActive(item.path) ? '#f59e0b' : '#3b7a5a',
                    fontWeight: 300,
                    marginTop: '1px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid #0a3d22',
            fontSize: '11px',
            color: '#3b7a5a',
            textAlign: 'center',
          }}
        >
          <p>Precious v1.0</p>
          <p style={{ marginTop: '2px' }}>You've got this 💚</p>
        </div>
      </nav>
    </>
  )
}

export default Sidebar
