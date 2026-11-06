import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppIcon from './AppIcon'

function AdminSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  const menuItems = [
    { path: '/admin', icon: 'shield', label: 'Dashboard', desc: 'Admin overview' },
    { path: '/admin/events', icon: 'calendar', label: 'Events', desc: 'Manage events' },
    { path: '/admin/groups', icon: 'users', label: 'Groups', desc: 'Support groups' },
    { path: '/admin/resources', icon: 'resources', label: 'Resources', desc: 'Manage resources' },
    { path: '/admin/analytics', icon: 'analytics', label: 'Analytics', desc: 'User data' },
    { path: '/admin/broadcast', icon: 'broadcast', label: 'Broadcast', desc: 'Send messages' },
    { path: '/admin/crisis', icon: 'alert', label: 'Crisis Alerts', desc: 'Active alerts' },
    { path: '/dashboard', icon: 'home', label: 'User App', desc: 'Switch view' },
    { path: '/logout', icon: 'logout', label: 'Logout', desc: 'Sign out' },
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

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mobile-hamburger"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid #FFFFFF',
          color: '#FFFFFF',
        }}
      >
        {mobileOpen ? '' : ''}
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="sidebar-overlay mobile-overlay"
          data-visible="true"
        />
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="desktop-toggle"
        style={{
          left: collapsed ? '16px' : '260px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid #FFFFFF',
          color: '#FFFFFF',
        }}
      >
        {collapsed ? '' : 'Collapse'}
      </button>

      <div
        className="sidebar"
        data-collapsed={collapsed}
        style={{
          left: mobileOpen ? 0 : collapsed ? '-260px' : '0',
          background: 'rgba(255,255,255,0.06)',
          borderRight: '2px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0B1220',
          }}
        >
          <span
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => handleNav('/admin')}
          >
            LossLens <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.08)' }}>ADMIN</span>
          </span>
        </div>

        <nav style={{ flex: 1, padding: '0 0.5rem' }}>
          {menuItems.map((item) => (
            <button
              key={item.path}
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
                background: isActive(item.path) ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: item.path === '/logout' ? '#FFFFFF' : isActive(item.path) ? '#FFFFFF' : '#2DD4BF',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = '#0B1220'
                  e.currentTarget.style.color = '#FFFFFF'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = item.path === '/logout' ? '#FFFFFF' : '#2DD4BF'
                }
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  width: '24px',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon name={item.icon} size={18} />
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
                    color: isActive(item.path) ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
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
        </nav>

        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.08)',
            textAlign: 'center',
          }}
        >
          <p>Admin Panel v1.0</p>
        </div>
      </div>
    </>
  )
}

export default AdminSidebar
