import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const linkStyle = {
  color: '#fff',
  textDecoration: 'none',
  display: 'block',
  padding: '10px 12px',
  borderRadius: '4px',
}

const labels = {
  '/admin': 'Dashboard',
  '/admin/events': 'Events',
  '/admin/groups': 'Groups',
  '/admin/resources': 'Resources',
  '/admin/analytics': 'Analytics',
  '/admin/broadcast': 'Broadcast',
  '/admin/crisis': 'Crisis Alerts',
  '/admin/users': 'User Management',
  '/admin/insurance': 'Insurance Partners',
  '/admin/b2b': 'B2B Clients',
  '/admin/grants': 'Grant Applications',
  '/admin/chats': 'Chat Viewer',
  '/admin/logs': 'Audit Logs',
  '/admin/settings': 'System Settings',
}

function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .single()

      if (mounted) setIsSuperAdmin(profile?.is_super_admin === true)
    }

    loadProfile()

    return () => {
      mounted = false
    }
  }, [navigate])

  const standardLinks = [
    ['Dashboard', '/admin'],
    ['Events', '/admin/events'],
    ['Groups', '/admin/groups'],
    ['Resources', '/admin/resources'],
    ['Analytics', '/admin/analytics'],
    ['Broadcast', '/admin/broadcast'],
    ['Crisis Alerts', '/admin/crisis'],
  ]

  const elevatedLinks = [
    ['User Management', '/admin/users'],
    ['Insurance Partners', '/admin/insurance'],
    ['B2B Clients', '/admin/b2b'],
    ['Grant Applications', '/admin/grants'],
    ['Chat Viewer', '/admin/chats'],
    ['Audit Logs', '/admin/logs'],
    ['System Settings', '/admin/settings'],
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      <aside style={{ background: '#0B1220', color: '#fff', padding: '24px 16px' }}>
        <h2 style={{ fontSize: '20px', margin: '0 0 20px' }}>LossLens Admin</h2>
        <nav>
          {standardLinks.map(([label, path]) => (
            <Link key={path} to={path} style={linkStyle}>{label}</Link>
          ))}
          {isSuperAdmin && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', padding: '0 12px' }}>Elevated Access</h3>
              {elevatedLinks.map(([label, path]) => (
                <Link key={path} to={path} style={linkStyle}>{label}</Link>
              ))}
            </div>
          )}
        </nav>
      </aside>
      <main style={{ background: '#f4f4f4', minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '1px solid #ddd', padding: '16px 24px' }}>
          <strong>{labels[location.pathname] || 'Admin Portal'}</strong>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
