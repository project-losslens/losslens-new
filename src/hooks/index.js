import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ---- useMediaQuery.js ---- */

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const updateMatches = (event) => setMatches(event.matches)

    mediaQuery.addEventListener('change', updateMatches)
    return () => mediaQuery.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}

/* ---- useDocumentTitle.js ---- */

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    if (title) document.title = `${title} — LossLens`
    return () => { document.title = prev }
  }, [title])
}

const avatarUrlCache = new Map()
const pendingAvatarUrls = new Map()
const AVATAR_URL_TTL_MS = 50 * 60 * 1000

function getAvatarReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return null
  const value = reference.trim()
  if (!/^https?:\/\//i.test(value)) {
    return value.includes('/') ? { path: value, url: null } : null
  }

  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/avatars\/(.+)$/)
    if (match) return { path: decodeURIComponent(match[1]), url: null }
    return { path: null, url: value }
  } catch (error) {
    console.error('Could not parse profile avatar URL:', error)
    return null
  }
}

async function loadAvatarUrl(reference) {
  const avatar = getAvatarReference(reference)
  if (!avatar) return null
  if (avatar.url) return avatar.url

  const cached = avatarUrlCache.get(avatar.path)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  if (!pendingAvatarUrls.has(avatar.path)) {
    pendingAvatarUrls.set(avatar.path, supabase.storage
      .from('avatars')
      .createSignedUrl(avatar.path, 3600)
      .then(({ data, error }) => {
        if (error) throw error
        if (!data?.signedUrl) throw new Error('Supabase returned no signed avatar URL')
        avatarUrlCache.set(avatar.path, { url: data.signedUrl, expiresAt: Date.now() + AVATAR_URL_TTL_MS })
        return data.signedUrl
      })
      .finally(() => pendingAvatarUrls.delete(avatar.path)))
  }

  return pendingAvatarUrls.get(avatar.path)
}

export function useAvatarUrl(reference) {
  const [url, setUrl] = useState(() => {
    const avatar = getAvatarReference(reference)
    if (!avatar) return null
    if (avatar.url) return avatar.url
    const cached = avatarUrlCache.get(avatar.path)
    return cached?.expiresAt > Date.now() ? cached.url : null
  })

  useEffect(() => {
    let active = true
    setUrl(null)
    if (!reference) return () => { active = false }

    loadAvatarUrl(reference)
      .then((resolvedUrl) => { if (active) setUrl(resolvedUrl) })
      .catch((error) => {
        console.error('Profile avatar could not be loaded:', error)
        if (active) setUrl(null)
      })

    return () => { active = false }
  }, [reference])

  return url
}
