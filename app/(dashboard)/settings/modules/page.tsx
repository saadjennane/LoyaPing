'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ShoppingBag, CalendarDays, Gift, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { BusinessModules } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'
import { useModules } from '@/lib/context/modules'
import { useConfigStatus } from '@/lib/context/config-status'

type ModulesState = Pick<BusinessModules, 'orders_enabled' | 'appointments_enabled' | 'loyalty_enabled' | 'reviews_enabled'>

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

const MODULE_DEFS = [
  {
    key:         'orders_enabled'       as const,
    label:       'Commandes',
    desc:        'Gestion des commandes click & collect',
    icon:        ShoppingBag,
    settingsHref: '/settings/orders',
    guidance:    "L'envoi WhatsApp n'est pas encore configuré. Vous pouvez gérer les commandes, mais aucun message ne sera envoyé au client tant que vous n'avez pas défini votre message \"Commande prête\".",
    configKey:   'orders_configured'    as const,
  },
  {
    key:         'appointments_enabled' as const,
    label:       'Rendez-vous',
    desc:        'Calendrier et suivi des rendez-vous',
    icon:        CalendarDays,
    settingsHref: '/settings/appointments',
    guidance:    "Les rappels WhatsApp ne sont pas encore configurés. Vous pouvez gérer les rendez-vous, mais aucun rappel ne sera envoyé tant que vous n'avez pas ajouté au moins un rappel.",
    configKey:   'appointments_configured' as const,
  },
  {
    key:         'loyalty_enabled'      as const,
    label:       'Fidélité & Coupons',
    desc:        'Programme de fidélité, paliers, coupons',
    icon:        Gift,
    settingsHref: '/settings/loyalty',
    guidance:    'La fidélité doit être configurée avant de pouvoir être utilisée. Créez au moins un palier pour activer le système.',
    configKey:   'loyalty_configured'   as const,
  },
]

export default function ModulesPage() {
  const { t } = useI18n()
  const { setModules: setContextModules } = useModules()
  const { status, refresh: refreshStatus } = useConfigStatus()

  const [modules, setModules]     = useState<ModulesState>({ orders_enabled: true, appointments_enabled: true, loyalty_enabled: true, reviews_enabled: false })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  const fetchModules = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/settings/modules')
    const json = await res.json()
    if (json.data) {
      setModules({
        orders_enabled:       json.data.orders_enabled,
        appointments_enabled: json.data.appointments_enabled,
        loyalty_enabled:      json.data.loyalty_enabled,
        reviews_enabled:      json.data.reviews_enabled ?? false,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchModules() }, [fetchModules])

  const handleToggle = async (key: keyof ModulesState, val: boolean) => {
    const next     = { ...modules, [key]: val }
    const anyActive = next.orders_enabled || next.appointments_enabled || next.loyalty_enabled
    if (!anyActive) { toast.error(t('settings.errors.atLeastOneModule')); return }

    setModules(next)
    setSaving(true)
    const res  = await fetch('/api/settings/modules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
      setModules(modules) // rollback
    } else {
      setContextModules(next)
      refreshStatus()
      toast.success(t('settings.toast.modulesSaved'))
    }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>

  const activeCount = [modules.orders_enabled, modules.appointments_enabled, modules.loyalty_enabled].filter(Boolean).length

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Modules</h2>
        <p className="text-sm text-muted-foreground">Activez ou désactivez les modules. Au moins un module doit rester actif.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activer / désactiver les modules</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {MODULE_DEFS.map(({ key, label, desc, icon: Icon, settingsHref, guidance, configKey }) => {
            const isOn         = modules[key]
            const isLastActive = isOn && activeCount === 1
            const configured   = isOn && status ? status[configKey] : null

            return (
              <div key={key} className="py-4 first:pt-0 last:pb-0 space-y-3">
                {/* Row */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      {isOn && configured === true && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Configuré
                        </span>
                      )}
                      {isOn && configured === false && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertCircle className="h-3 w-3" /> À configurer
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    {isLastActive && (
                      <p className="text-xs text-amber-600 mt-0.5">{t('settings.errors.atLeastOneModule')}</p>
                    )}
                  </div>
                  <Toggle checked={isOn} disabled={saving || isLastActive} onChange={(val) => handleToggle(key, val)} />
                </div>

                {/* Guidance text when enabled but not configured */}
                {isOn && configured === false && (
                  <div className="ml-11 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-amber-800 dark:text-amber-300">{guidance}</p>
                    <Link href={settingsHref}>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">
                        <Settings2 className="h-3 w-3" /> Configurer
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
