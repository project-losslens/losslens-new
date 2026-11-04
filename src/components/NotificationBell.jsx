import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, subscribeToNotifications } from '../lib/notifications'
import { supabase } from '../lib/supabase'

function NotificationBell() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchUserId()
  }, [])

  useEffect(() => {
    if (userId) {
      fetchNotifications()
      fetchUnreadCount()
      const unsubscribe = subscribeToNotifications(userId, (newNotif) => {
        setNotifications(prev => [newNotif, ...prev].slice(0, 20))
        setUnreadCount(prev => prev + 1)
      })
      return () => unsubscribe()
    }
  }, [userId])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setUserId(session.user.id)
  }

  const fetchNotifications = async () => {
    const data = await getNotifications(userId)
    setNotifications(data)
  }

  const fetchUnreadCount = async () => {
    const count = await getUnreadCount(userId)
    setUnreadCount(count)
  }

  const handleMarkAsRead = async (id, link) => {
    await markAsRead(id)
    setUnreadCount(prev => Math.max(0, prev - 1))
    if (link) navigate(link)
    setOpen(false)
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId)
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const getTypeStyle = (type) => {
    switch (type) {
      case 'danger': return { bg: '#791F1F', color: '#F09595' }
      case 'warning': return { bg: '#633806', color: '#FAC775' }
      case 'success': return { bg: '#0a3d22', color: '#6ee7b7' }
      case 'badge': return { bg: '#0a3d22', color: '#f59e0b' }
      default: return { bg: '#062616', color: '#9fe1cb' }
    }
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Icon */}
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications() }}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          position: 'relative', fontSize: '20px', padding: '4px 8px',
          color: unreadCount > 0 ? '#f59e0b' : '#3b7a5a',
          transition: 'color 0.2s',
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            style={{
              position: 'absolute', top: '0', right: '0',
              background: '#f59e0b', color: '#041f13',
              fontSize: '10px', fontWeight: 700,
              width: '18px', height: '18px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="Notifications menu"
          style={{
            position: 'absolute', top: '40px', right: '-10px',
            width: '340px', maxHeight: '420px',
            background: '#062616', border: '1px solid #0a3d22', borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 500,
            overflowY: 'auto', animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid #0a3d22',
            position: 'sticky', top: 0, background: '#062616', zIndex: 1,
          }}>
            <h3 style={{ color: '#e2f5ec', fontSize: '14px', margin: 0 }}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent', border: 'none', color: '#6ee7b7',
                  fontSize: '11px', cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }} aria-hidden="true">🔔</span>
              <p style={{ color: '#3b7a5a', fontSize: '13px' }}>No notifications yet</p>
            </div>
          ) : (
            notifications.map(n => {
              const style = getTypeStyle(n.type)
              return (
                <div
                  key={n.id}
                  role="menuitem"
                  onClick={() => handleMarkAsRead(n.id, n.link)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #0a3d22',
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: n.read ? 'transparent' : '#041f13',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0a3d22'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : '#041f13'}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: '18px', width: '32px', height: '32px',
                        borderRadius: '50%', background: style.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {n.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500, margin: '0 0 2px' }}>
                        {n.title}
                        {!n.read && (
                          <span
                            aria-label="Unread"
                            style={{
                              width: '6px', height: '6px', borderRadius: '50%',
                              background: '#f59e0b', display: 'inline-block', marginLeft: '6px',
                            }}
                          />
                        )}
                      </p>
                      <p style={{ color: '#9fe1cb', fontSize: '12px', margin: '0 0 4px', lineHeight: '1.4' }}>
                        {n.message}
                      </p>
                      <span style={{ color: '#3b7a5a', fontSize: '10px' }}>
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
