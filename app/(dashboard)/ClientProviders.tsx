'use client'

import { CustomerIndexProvider } from '@/lib/hooks/useCustomerIndex'
import { I18nProvider } from '@/lib/i18n/provider'
import { ModulesProvider, type Modules } from '@/lib/context/modules'
import { ConfigStatusProvider } from '@/lib/context/config-status'
import { ClientFieldConfigProvider, type ClientFieldConfig } from '@/lib/context/client-field-config'

export default function ClientProviders({
  children,
  initialModules,
  initialFieldConfig,
}: {
  children:           React.ReactNode
  initialModules:     Modules
  initialFieldConfig: ClientFieldConfig
}) {
  return (
    <ModulesProvider initial={initialModules}>
      <ClientFieldConfigProvider initial={initialFieldConfig}>
        <ConfigStatusProvider>
          <I18nProvider>
            <CustomerIndexProvider>{children}</CustomerIndexProvider>
          </I18nProvider>
        </ConfigStatusProvider>
      </ClientFieldConfigProvider>
    </ModulesProvider>
  )
}
