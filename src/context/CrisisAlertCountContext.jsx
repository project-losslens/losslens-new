import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CrisisAlertCountContext = createContext(0)

export function CrisisAlertCountProvider({ children }) {
  const [openCount, setOpenCount] = useState(0)

  useEffect(() => {
    let active = true
    const refreshOpenCount = async () => {
      const { count, error } = await supabase
        .from('crisis_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false)

      if (error) {
        console.error('Failed to load open crisis alert count:', error)
        return
      }
      if (active) setOpenCount(count || 0)
    }

    void refreshOpenCount()
    const channel = supabase.channel('app_shell_crisis_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crisis_alerts' }, refreshOpenCount)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Crisis alert count subscription failed:', error || status)
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return (
    <CrisisAlertCountContext.Provider value={openCount}>
      {children}
    </CrisisAlertCountContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCrisisAlertCount() {
  return useContext(CrisisAlertCountContext)
}
