import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppIcon from './AppIcon'

function SuperAdminSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    setCollapsed(true)
    setMobileOpen(false)
  }, [location.pathname])

  const menuItems = [
    { path: '/super-admin', icon: 'analytics', label: 'Dashboard', desc: 'Platform overview' },
    { path: '/super-admin/users', icon: 'users', label: 'Users', desc: 'User management' },
    { path: '/super-admin/admins', icon: 'shield', label: 'Admins', desc: 'Admin management' },
    { path: '/super-admin/settings', icon: 'settings', label: 'Settings', desc: 'System config' },
    { path: '/super-admin/logs', icon: 'document', label: 'Audit Logs', desc: 'Activity trail' },
    { path: '/super-admin/b2b', icon: 'building', label: 'B2B Clients', desc: 'Corporate clients' },
    { path: '/super-admin/insurance', icon: 'medical', label: 'Insurance', desc: 'Partners' },
    { path: '/super-admin/grants', icon: 'document', label: 'Grants', desc: 'Applications' },
    { path: '/admin', icon: 'shield', label: 'Admin Panel', desc: 'Switch to admin' },
    { path: '/dashboard', icon: 'home', label: 'User App', desc: 'Switch view' },
    { path: '/logout', icon: 'logout', label: 'Logout', desc: 'Sign out' },
    { path: '/super-admin/chats', icon: 'chat', label: 'Chat Viewer', desc: 'User conversations' },
  ]

  const isActive = (path) => location.pathname === path

  const handleNav = async (path) => {
    if (path === '/logout') {
      await supabase.auth.signOut()
      navigate('/', { replace: true })
      return
    }
    navigate(path)
    setCollapsed(true)
    setMobileOpen(false)
  }

  const closeAll = () => {
    setCollapsed(true)
    setMobileOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        style={{
          position: 'fixed', top: '12px', left: '12px', zIndex: 1100,
          background: '#633806', border: '1px solid #f59e0b', borderRadius: '8px',
          width: '36px', height: '36px', display: 'none', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: '#f59e0b', fontSize: '18px',
        }}
        className="mobile-hamburger"
      >
        {mobileOpen ? '' : ''}
      </button>

      {(!collapsed || mobileOpen) && (
        <div
          onClick={closeAll}
          aria-hidden="true"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(4, 31, 19, 0.8)', zIndex: 1050,
          }}
        />
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        style={{
          position: 'fixed', top: '16px', left: collapsed ? '16px' : '220px',
          zIndex: 1100, background: '#633806', border: '1px solid #f59e0b',
          borderRadius: '50%', width: '32px', height: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#f59e0b', fontSize: '14px',
          transition: 'left 0.3s ease',
        }}
        className="desktop-toggle"
      >
        {collapsed ? '' : 'Collapse'}
      </button>

      <nav
        aria-label="Super admin navigation"
        style={{
          position: 'fixed', top: 0, bottom: 0,
          left: mobileOpen ? 0 : collapsed ? '-260px' : '0',
          width: '260px', background: '#062616', borderRight: '2px solid #f59e0b',
          zIndex: 1090, display: 'flex', flexDirection: 'column',
          transition: 'left 0.3s ease', overflowY: 'auto', paddingBottom: '1rem',
        }}
        className="sidebar"
      >
        <div style={{
          padding: '1.25rem 1rem', borderBottom: '1px solid #f59e0b',
          marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', background: '#0a0a0a',
        }}>
          <span style={{
            fontFamily: "'Playfair Display', serif", fontSize: '20px',
            color: '#f59e0b', fontWeight: 700, cursor: 'pointer',
          }} onClick={() => handleNav('/super-admin')}>
            LossLens <span style={{ fontSize: '12px', color: '#f59e0b' }}>SA</span>
          </span>
        </div>

        <div role="menubar" style={{ flex: 1, padding: '0 0.5rem' }}>
          {menuItems.map(item => (
            <button
              key={item.path}
              role="menuitem"
              aria-current={isActive(item.path) ? 'page' : undefined}
              onClick={() => handleNav(item.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', marginBottom: '2px', borderRadius: '8px',
                border: 'none',
                background: isActive(item.path) ? '#633806' : 'transparent',
                color: item.path === '/logout' ? '#F09595' : isActive(item.path) ? '#f59e0b' : '#6ee7b7',
                cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: '13px',
                textAlign: 'left', transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = '#0a0a0a'
                  e.currentTarget.style.color = '#f59e0b'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = item.path === '/logout' ? '#F09595' : '#6ee7b7'
                }
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>
                <AppIcon name={item.icon} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: isActive(item.path) ? 600 : 400, fontSize: '13px' }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: '10px', color: isActive(item.path) ? '#f59e0b' : '#3b7a5a',
                  fontWeight: 300, marginTop: '1px', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{
          padding: '0.75rem 1rem', borderTop: '1px solid #f59e0b',
          fontSize: '11px', color: '#f59e0b', textAlign: 'center',
        }}>
          <p>Super Admin v1.0 </p>
        </div>
      </nav>

      <style>{`
        .desktop-toggle { display: flex; }
        .mobile-hamburger { display: none; }
        
        @media (max-width: 768px) {
          .desktop-toggle { display: none !important; }
          .mobile-hamburger { display: flex !important; }
          
          .main-content {
            margin-left: 0 !important;
            padding-top: 60px !important;
          }
          
          .main-content > nav:first-child {
            position: relative !important;
            top: auto !important;
          }
        }
        
        @media (min-width: 769px) {
          .main-content {
            margin-left: 48px !important;
          }
          
          .main-content > nav:first-child {
            padding-left: 40px !important;
          }
        }
      `}</style>
    </>
  )
}

export default SuperAdminSidebar
