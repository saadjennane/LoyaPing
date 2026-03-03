'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Home,
  Activity,
  Users,
  Gift,
  MoreHorizontal,
  Star,
  Settings2,
  BookOpen,
  ChevronRight,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useModules } from '@/lib/context/modules'
import { useUrgentCount } from '@/lib/context/urgent-count'

// ─── Primary tabs ─────────────────────────────────────────────────────────────

type PrimaryItem = {
  href: string
  icon: React.ElementType
  label: string
  gradient: string
  isActive: (p: string) => boolean
}

function buildPrimaryItems(modules: {
  orders_enabled: boolean
  appointments_enabled: boolean
  loyalty_enabled: boolean
  reviews_enabled: boolean
}): PrimaryItem[] {
  const items: PrimaryItem[] = [
    {
      href: '/',
      icon: Home,
      label: 'Accueil',
      gradient: 'from-red-400 to-orange-400',
      isActive: (p) => p === '/',
    },
  ]

  if (modules.orders_enabled || modules.appointments_enabled) {
    const activityHref = modules.orders_enabled ? '/orders' : '/appointments'
    items.push({
      href: activityHref,
      icon: Activity,
      label: 'Activité',
      gradient: 'from-blue-400 to-cyan-500',
      isActive: (p) => p.startsWith('/orders') || p.startsWith('/appointments'),
    })
  }

  items.push({
    href: '/clients',
    icon: Users,
    label: 'Clients',
    gradient: 'from-emerald-400 to-teal-500',
    isActive: (p) => p.startsWith('/clients'),
  })

  if (modules.loyalty_enabled) {
    items.push({
      href: '/coupons',
      icon: Gift,
      label: 'Fidélité',
      gradient: 'from-fuchsia-400 to-pink-500',
      isActive: (p) => p.startsWith('/coupons'),
    })
  }

  return items
}

// ─── More sheet items ─────────────────────────────────────────────────────────

type MoreItem = {
  href: string
  icon: React.ElementType
  label: string
  gradient: string
  badge?: number
}

function buildMoreItems(modules: {
  reviews_enabled: boolean
}, pendingCount: number): MoreItem[] {
  const items: MoreItem[] = []

  if (modules.reviews_enabled) {
    items.push({
      href: '/reviews',
      icon: Star,
      label: 'Avis clients',
      gradient: 'from-amber-400 to-yellow-500',
      badge: pendingCount,
    })
  }

  items.push({
    href: '/settings',
    icon: Settings2,
    label: 'Paramètres',
    gradient: 'from-slate-400 to-slate-600',
  })
  items.push({
    href: '/onboarding',
    icon: BookOpen,
    label: 'Tutoriel',
    gradient: 'from-violet-400 to-purple-500',
  })

  return items
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileBottomNav() {
  const { modules }      = useModules()
  const { pendingCount } = useUrgentCount()
  const pathname         = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const primaryItems = buildPrimaryItems(modules)
  const moreItems    = buildMoreItems(modules, pendingCount)

  const moreIsActive = pathname.startsWith('/reviews') || pathname.startsWith('/settings') || pathname === '/onboarding'
  const moreBadge    = pendingCount

  // Activity switcher — shown when both modules enabled AND on an activity page
  const onActivity = pathname.startsWith('/orders') || pathname.startsWith('/appointments')
  const showActivitySwitcher = onActivity && modules.orders_enabled && modules.appointments_enabled

  return (
    <>
      {/* ── Activity switcher pill (floats above nav) ────────────────────── */}
      <div
        className={`lg:hidden fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
          showActivitySwitcher
            ? 'bottom-[68px] opacity-100 pointer-events-auto'
            : 'bottom-[56px] opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-0.5 bg-background border border-border rounded-full shadow-md px-1 py-1">
          <Link
            href="/orders"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
              pathname.startsWith('/orders')
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Commandes
          </Link>
          <Link
            href="/appointments"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
              pathname.startsWith('/appointments')
                ? 'bg-violet-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            RDV
          </Link>
        </div>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
        <div className="flex pb-safe">

          {primaryItems.map((item) => {
            const isActive = item.isActive(pathname)
            const Icon     = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 min-w-0"
              >
                <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center transition-opacity duration-150 ${
                  isActive ? 'opacity-100' : 'opacity-35'
                }`}>
                  <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
                </div>
                <span className={`text-[10px] leading-none font-medium truncate transition-colors ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* ── Plus ── */}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 min-w-0"
          >
            <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center transition-opacity duration-150 relative ${
              moreIsActive ? 'opacity-100' : 'opacity-35'
            }`}>
              <MoreHorizontal className="h-[18px] w-[18px] text-white" strokeWidth={2} />
              {moreBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[15px] h-[15px] rounded-full bg-red-500 text-white text-[9px] font-bold px-1 leading-none">
                  {moreBadge > 9 ? '9+' : moreBadge}
                </span>
              )}
            </div>
            <span className={`text-[10px] leading-none font-medium transition-colors ${
              moreIsActive ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              Plus
            </span>
          </button>

        </div>
      </nav>

      {/* ── More bottom sheet ─────────────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="px-5 pb-2">
            <SheetTitle className="text-base">Menu</SheetTitle>
          </SheetHeader>

          <div className="px-3 pb-4 space-y-0.5">
            {moreItems.map((item) => {
              const Icon     = item.icon
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                    isActive ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shrink-0 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-70'
                  }`}>
                    <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
                  </div>
                  <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[11px] font-bold px-1.5">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </Link>
              )
            })}
          </div>

          {/* Safe area spacer */}
          <div className="pb-safe" />
        </SheetContent>
      </Sheet>
    </>
  )
}
