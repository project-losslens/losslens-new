import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AppIcon from '../../components/AppIcon'

function ChatViewer() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [chatLoading, setChatLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showUserList, setShowUserList] = useState(true)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('user_id, profiles(full_name)')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Users fetch error:', error)
        setUsers([])
        setLoading(false)
        return
      }

      const uniqueUsers = []
      const seen = new Set()
      ;(data || []).forEach(d => {
        if (!seen.has(d.user_id)) {
          seen.add(d.user_id)
          uniqueUsers.push({
            id: d.user_id,
            full_name: d.profiles?.full_name || 'Unknown User',
          })
        }
      })

      setUsers(uniqueUsers)
    } catch (err) {
      console.error('Fetch users error:', err)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const fetchConversations = async (userId) => {
    setChatLoading(true)
    setSelectedUser(userId)
    if (window.innerWidth <= 768) {
      setShowUserList(false)
    }

    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Conversations fetch error:', error)
        setConversations([])
        setChatLoading(false)
        return
      }

      setConversations(data || [])
    } catch (err) {
      console.error('Fetch conversations error:', err)
      setConversations([])
    } finally {
      setChatLoading(false)
    }
  }

  const handleBackToUsers = () => {
    setShowUserList(true)
    setSelectedUser(null)
  }

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleString('en-KE', {
      hour: '2-digit', minute: '2-digit',
      day: 'numeric', month: 'short',
    })
  }

  const groupedConversations = conversations.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-KE', {
      weekday: 'short', day: 'numeric', month: 'long',
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(msg)
    return acc
  }, {})

  return (
    <div className="page-root" style={{ display: 'flex', minHeight: '100vh' }}>


      <div style={{ flex: 1, minWidth: 0 }} className="page-content">
        <div className="page-toolbar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.5rem',

        }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', margin: 0 }}>
              Chat Viewer
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--info)', margin: '2px 0 0' }}>
              {users.length} users with chat history
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
          {/* User List */}
          <div style={{
            width: '300px', borderRight: '1px solid rgba(255,255,255,0.12)', overflowY: 'auto',
            flexShrink: 0, background: 'rgba(255,255,255,0.06)',
            display: showUserList ? 'block' : 'none',
          }} className="chat-user-list">
            <div style={{ padding: '12px' }}>
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search users"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)',
                  fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', padding: '1rem' }}>Loading...</p>
            ) : filteredUsers.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', padding: '1rem' }}>
                {search ? 'No users found' : 'No chat history yet'}
              </p>
            ) : (
              filteredUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => fetchConversations(u.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View conversations for ${u.full_name}`}
                  onKeyDown={e => e.key === 'Enter' && fetchConversations(u.id)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    background: selectedUser === u.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.12)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (selectedUser !== u.id) e.currentTarget.style.background = 'var(--bg)' }}
                  onMouseLeave={e => { if (selectedUser !== u.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <p style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500, margin: 0 }}>
                    {u.full_name}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '2px 0 0' }}>
                    {u.id.slice(0, 8)}"¦
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Chat Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
          }} className="chat-area">
            {/* Mobile back button */}
            {!showUserList && (
              <button
                onClick={handleBackToUsers}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--primary)',
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', marginBottom: '12px', alignSelf: 'flex-start',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
                className="mobile-back-btn"
              >
                <span>←</span> Back to users
              </button>
            )}

            {!selectedUser ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'rgba(255,255,255,0.4)' }}>
                <AppIcon name="chat" size={48} style={{ display: 'block', margin: '0 auto 12px', color: 'rgba(255,255,255,0.4)' }} />
                <p style={{ color: 'var(--primary)', fontSize: '14px' }}>Select a user to view their conversations</p>
                <p style={{ fontSize: '12px' }}>All chats are read-only</p>
              </div>
            ) : chatLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', padding: '2rem' }}>Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
                <p style={{ fontSize: '13px' }}>No conversations found for this user.</p>
              </div>
            ) : (
              <div style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
                {Object.entries(groupedConversations).map(([date, msgs]) => (
                  <div key={date} style={{ marginBottom: '24px' }}>
                    <div style={{
                      textAlign: 'center', marginBottom: '12px',
                      position: 'sticky', top: 0, zIndex: 'var(--z-content)',
                    }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.12)', color: 'var(--primary)', padding: '4px 14px',
                        borderRadius: '100px', fontSize: '11px',
                      }}>
                        {date}
                      </span>
                    </div>

                    {msgs.map(msg => (
                      <div key={msg.id} style={{
                        display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                        gap: '8px', marginBottom: '12px',
                      }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: msg.role === 'user' ? 'var(--info)' : 'rgba(255,255,255,0.12)',
                          border: `2px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.4)' : 'var(--primary)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', flexShrink: 0,
                        }} aria-hidden="true">
                          {msg.role === 'user' ? '' : ''}
                        </div>
                        <div style={{ maxWidth: '80%' }}>
                          <div style={{
                            padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            background: msg.role === 'user' ? 'var(--bg)' : 'rgba(255,255,255,0.12)',
                            color: 'var(--info)',
                            fontSize: '13px', lineHeight: '1.6',
                            wordBreak: 'break-word',
                          }}>
                            {msg.message}
                          </div>
                          <span style={{
                            fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px',
                            display: 'block', textAlign: msg.role === 'user' ? 'right' : 'left',
                          }}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; }
          .chat-user-list {
            position: absolute !important;
            z-index: var(--z-modal) !important;
            width: 100% !important;
            height: 100% !important;
          }
          .chat-user-list.hidden {
            display: none !important;
          }
          .chat-area {
            width: 100% !important;
          }
          .mobile-back-btn {
            display: flex !important;
          }
        }
        @media (min-width: 769px) {
          .mobile-back-btn {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default ChatViewer
