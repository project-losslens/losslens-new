import { useRef, useState } from 'react'
import { toast } from './ToastProvider'

export default function RefreshButton({ onRefresh, children = 'Refresh', disabled, ...props }) {
  const inFlight = useRef(false)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      if (await onRefresh() === true) toast.success('Up to date.')
      else toast.error('Could not refresh. Please try again.')
    } catch {
      toast.error('Could not refresh. Please try again.')
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }

  return <button {...props} type="button" onClick={refresh} disabled={disabled || refreshing} aria-busy={refreshing}>
    {refreshing ? 'Refreshing…' : children}
  </button>
}
