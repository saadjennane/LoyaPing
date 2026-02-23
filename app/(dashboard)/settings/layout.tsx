'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, LayoutGrid, Globe, Trash2, ShoppingBag, CalendarDays, Gift, Users, ChevronLeft, LogOut } from 'lucide-react'
import { useModules } from '@/lib/context/modules'
import { useConfigStatus } from '@/lib/context/config-status'
import { createBrowserClient } from '@supabase/ssr'
import { useMemo } from 'react'

const ALWAYS_ITEMS = [
  { href: '/settings/organization', label: 'Organisation',   icon: Building2 },
  { href: '/settings/modules',      label: 'Modules',        icon: LayoutGrid },
  { href: '/settings/clients',      label: 'Clients',        icon: Users },
  { href: '/settings/portal',       label: 'Portail client', icon: Globe },
  { href: '/settings/trash',        label: 'Corbeille',      icon: Trash2 },
] as const

const MODULE_ITEMS = [
  {
    href:      '/settings/orders',
    label:     'Commandes',
    icon:      ShoppingBag,
    moduleKey: 'orders_enabled'       as const,
    statusKey: 'orders_configured'    as const,
  },
  {
    href:      '/settings/appointments',
    label:     'Rendez-vous',
    icon:      CalendarDays,
    moduleKey: 'appointments_enabled' as const,
    statusKey: 'appointments_configured' as const,
  },
  {
    href:      '/settings/loyalty',
    label:     'Fidélité',
    icon:      Gift,
    moduleKey: 'loyalty_enabled'      as const,
    statusKey: 'loyalty_configured'   as const,
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname()
  const router     = useRouter()
  const { modules } = useModules()
  const { status }  = useConfigStatus()

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="flex h-full min-h-0">
      {/* ── Secondary nav ── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border sticky top-0 h-screen">
        <div className="flex-1 p-3 space-y-0.5">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Paramètres
          </p>

          {ALWAYS_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive(href)
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
            </Link>
          ))}

          {/* Dynamic module items */}
          {MODULE_ITEMS.some((m) => modules[m.moduleKey]) && (
            <>
              <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Modules
              </p>
              {MODULE_ITEMS.filter((m) => modules[m.moduleKey]).map(
                ({ href, label, icon: Icon, statusKey }) => {
                  const configured = status ? status[statusKey] : null
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive(href)
                          ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {configured !== null && (
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            configured ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      )}
                    </Link>
                  )
                },
              )}
            </>
          )}
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {/* Mobile back bar — visible on sub-pages only */}
        {pathname !== '/settings' && (
          <div className="md:hidden flex items-center gap-1 px-4 py-3 border-b shrink-0">
            <Link
              href="/settings"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Paramètres
            </Link>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
