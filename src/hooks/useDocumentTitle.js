import { useEffect } from 'react'

export default function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    if (title) document.title = `${title} — LossLens`
    return () => { document.title = prev }
  }, [title])
}
