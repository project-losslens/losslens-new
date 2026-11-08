import { useEffect, useState } from 'react'

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
