import { useState } from 'react'
import { useAvatarUrl } from '../hooks'

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export default function UserAvatar({ reference, name, className = 'user-avatar', size }) {
  const url = useAvatarUrl(reference)
  const [imageFailed, setImageFailed] = useState(false)

  if (url && !imageFailed) {
    return (
      <img
        className={className}
        src={url}
        alt={name ? `${name} profile photo` : 'Profile photo'}
        width={size}
        height={size}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <span
      className={className}
      role="img"
      aria-label={name ? `${name} initials` : 'User initials'}
      style={size ? { width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) } : undefined}
    >
      {getInitials(name)}
    </span>
  )
}
