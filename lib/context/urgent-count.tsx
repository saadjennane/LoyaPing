'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type UrgentCountContextValue = {
  pendingCount: number
  refresh:      () => void
}

const UrgentCountContext = createContext<UrgentCountContextValue | null>(null)

// Poll every 60 seconds for pending urgent events
const POLL_INTERVAL_MS = 60_000

export function UrgentCountProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/urgent-events?count=true')
      const json = await res.json()
      if (typeof json.data?.pending === 'number') setPendingCount(json.data.pending)
    } catch {
      // keep previous value on error
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <UrgentCountContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </UrgentCountContext.Provider>
  )
}

export function useUrgentCount(): UrgentCountContextValue {
  const ctx = useContext(UrgentCountContext)
  if (!ctx) throw new Error('useUrgentCount must be used within UrgentCountProvider')
  return ctx
}
