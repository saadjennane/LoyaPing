'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

export type ClientFieldConfig = {
  detail_email:          boolean
  detail_birthday:       boolean
  detail_notes:          boolean
  detail_last_activity:  boolean
  list_email:            boolean
  list_birthday:         boolean
  list_last_activity:    boolean
}

export const DEFAULT_CLIENT_FIELD_CONFIG: ClientFieldConfig = {
  detail_email:          true,
  detail_birthday:       false,
  detail_notes:          false,
  detail_last_activity:  false,
  list_email:            false,
  list_birthday:         false,
  list_last_activity:    true,
}

type ClientFieldConfigContextValue = {
  config:          ClientFieldConfig
  setFieldConfig:  (c: ClientFieldConfig) => void
}

const ClientFieldConfigContext = createContext<ClientFieldConfigContextValue | null>(null)

export function ClientFieldConfigProvider({
  initial,
  children,
}: {
  initial:  ClientFieldConfig
  children: ReactNode
}) {
  const [config, setFieldConfig] = useState<ClientFieldConfig>(initial)
  return (
    <ClientFieldConfigContext.Provider value={{ config, setFieldConfig }}>
      {children}
    </ClientFieldConfigContext.Provider>
  )
}

export function useClientFieldConfig(): ClientFieldConfigContextValue {
  const ctx = useContext(ClientFieldConfigContext)
  if (!ctx) throw new Error('useClientFieldConfig must be used within ClientFieldConfigProvider')
  return ctx
}
