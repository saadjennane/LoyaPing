'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type ConfigStatus = {
  orders_configured:       boolean
  appointments_configured: boolean
  loyalty_configured:      boolean
}

type ConfigStatusContextValue = {
  status:  ConfigStatus | null   // null = still loading
  refresh: () => void
}

const ConfigStatusContext = createContext<ConfigStatusContextValue | null>(null)

export function ConfigStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConfigStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/settings/config-status')
      const json = await res.json()
      if (json.data) setStatus(json.data)
    } catch {
      // keep previous status on error
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <ConfigStatusContext.Provider value={{ status, refresh }}>
      {children}
    </ConfigStatusContext.Provider>
  )
}

export function useConfigStatus(): ConfigStatusContextValue {
  const ctx = useContext(ConfigStatusContext)
  if (!ctx) throw new Error('useConfigStatus must be used within ConfigStatusProvider')
  return ctx
}
