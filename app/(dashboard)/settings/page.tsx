'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, LayoutGrid, Globe, Trash2, ShoppingBag,
  CalendarDays, Gift, Users, ChevronRight,
} from 'lucide-react'
import { useModules } from '@/lib/context/modules'
import { useConfigStatus } from '@/lib/context/config-status'

const ALWAYS_ITEMS = [
  { href: '/settings/organization', label: 'Organisation',   icon: Building2 },
  { href: '/settings/modules',      label: 'Modules',        icon: LayoutGrid },
  { href: '/settings/clients',      label: 'Clients',        icon: Users },
  { href: '/settings/portal',       label: 'Portail client', icon: Globe },
  { href: '/settings/trash',        label: 'Corbeille',      icon: Trash2 },
]

const MODULE_ITEMS = [
  { href: '/settings/orders',       label: 'Commandes',   icon: ShoppingBag,  moduleKey: 'orders_enabled'       as const, statusKey: 'orders_configured'       as const },
  { href: '/settings/appointments', label: 'Rendez-vous', icon: CalendarDays, moduleKey: 'appointments_enabled' as const, statusKey: 'appointments_configured' as const },
  { href: '/settings/loyalty',      label: 'Fidélité',    icon: Gift,         moduleKey: 'loyalty_enabled'      as const, statusKey: 'loyalty_configured'      as const },
]

export default function SettingsPage() {
  const router = useRouter()
  const { modules } = useModules()
  const { status } = useConfigStatus()

  // Desktop: redirect to first settings page
  useEffect(() => {
    if (window.innerWidth >= 768) router.replace('/settings/organization')
  }, [router])

  const moduleItems = MODULE_ITEMS.filter((m) => modules[m.moduleKey])

  return (
    <div className="md:hidden p-4 space-y-4">
      <h2 className="text-xl font-bold px-1">Paramètres</h2>

      <div className="bg-card border rounded-xl divide-y divide-border overflow-hidden">
        {ALWAYS_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="flex-1 text-sm font-medium">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </Link>
        ))}
      </div>

      {moduleItems.length > 0 && (
        <>
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Modules
          </p>
          <div className="bg-card border rounded-xl divide-y divide-border overflow-hidden">
            {moduleItems.map(({ href, label, icon: Icon, statusKey }) => {
              const configured = status ? status[statusKey] : null
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  {configured !== null && (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${configured ? 'bg-green-500' : 'bg-red-500'}`} />
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
