'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

export type Modules = {
  orders_enabled:       boolean
  appointments_enabled: boolean
  loyalty_enabled:      boolean
}

type ModulesContextValue = {
  modules:    Modules
  setModules: (m: Modules) => void
}

const ModulesContext = createContext<ModulesContextValue | null>(null)

export function ModulesProvider({ initial, children }: { initial: Modules; children: ReactNode }) {
  const [modules, setModules] = useState<Modules>(initial)
  return (
    <ModulesContext.Provider value={{ modules, setModules }}>
      {children}
    </ModulesContext.Provider>
  )
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext)
  if (!ctx) throw new Error('useModules must be used within ModulesProvider')
  return ctx
}
