import { supabase } from './supabase'

// Create a notification
export async function createNotification(userId, { title, message, type = 'info', icon = '', link = null }) {
  if (!userId) return
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    icon,
    link,
  })
  if (error) console.error('Notification error:', error)
}

// Get unread count
export async function getUnreadCount(userId) {
  if (!userId) return 0
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) {
    console.error('Unread count error:', error)
    return 0
  }
  return count || 0
}

// Get all notifications
export async function getNotifications(userId, limit = 20) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('Notifications fetch error:', error)
    return []
  }
  return data || []
}

// Mark one as read
export async function markAsRead(notificationId) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId)
  if (error) console.error('Mark read error:', error)
}

// Mark all as read
export async function markAllAsRead(userId) {
  if (!userId) return
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  if (error) console.error('Mark all read error:', error)
}

// Subscribe to new notifications (real-time)
export function subscribeToNotifications(userId, callback) {
  if (!userId) return () => {}
  
  const channel = supabase
    .channel(`notifications_${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      callback(payload.new)
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// Notification triggers for various events
export const notifyBadgeEarned = (userId, badgeName, badgeEmoji) => {
  createNotification(userId, {
    title: ' Badge Earned!',
    message: `You earned the ${badgeEmoji} ${badgeName} badge!`,
    type: 'badge',
    icon: badgeEmoji,
    link: '/profile',
  })
}

export const notifyStreak = (userId, days) => {
  createNotification(userId, {
    title: ' Streak Milestone!',
    message: `${days} days gamble-free! You're building real strength.`,
    type: 'success',
    icon: '',
    link: '/dashboard',
  })
}

export const notifyHighRisk = (userId, score) => {
  createNotification(userId, {
    title: ' High Risk Day',
    message: `Your risk score is ${score}% today. Open your urge toolkit to stay prepared.`,
    type: 'danger',
    icon: '',
    link: '/urge-toolkit',
  })
}

export const notifyStreakFreeze = (userId) => {
  createNotification(userId, {
    title: ' Streak Freeze Used',
    message: 'Your streak freeze protected your progress. It renews in 30 days.',
    type: 'warning',
    icon: '',
    link: '/dashboard',
  })
}

export const notifyNewEvent = (userId, eventTitle) => {
  createNotification(userId, {
    title: ' New Event',
    message: `"${eventTitle}" has been added. Check it out!`,
    type: 'info',
    icon: '',
    link: '/events',
  })
}
