'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Package, CalendarDays, UsersRound, Tag, Settings2, Star } from 'lucide-react'
import { useModules } from '@/lib/context/modules'
import { useUrgentCount } from '@/lib/context/urgent-count'

const navItems = (modules: { orders_enabled: boolean; appointments_enabled: boolean; loyalty_enabled: boolean; reviews_enabled: boolean }) => [
  { href: '/',             icon: LayoutGrid,  label: 'Dashboard',  gradient: 'from-red-400 to-orange-400',       show: true },
  { href: '/clients',      icon: UsersRound,  label: 'Clients',    gradient: 'from-emerald-400 to-teal-500',     show: true },
  { href: '/orders',       icon: Package,     label: 'Commandes',  gradient: 'from-blue-400 to-cyan-500',        show: modules.orders_enabled },
  { href: '/appointments', icon: CalendarDays,label: 'RDV',        gradient: 'from-violet-400 to-purple-500',    show: modules.appointments_enabled },
  { href: '/coupons',      icon: Tag,         label: 'Fidélité',   gradient: 'from-fuchsia-400 to-pink-500',     show: modules.loyalty_enabled },
  { href: '/reviews',      icon: Star,        label: 'Reviews',    gradient: 'from-amber-400 to-yellow-500',     show: modules.reviews_enabled },
  { href: '/settings',     icon: Settings2,   label: 'Paramètres', gradient: 'from-slate-400 to-slate-600',      show: true },
].filter(item => item.show)

export default function MobileBottomNav() {
  const { modules } = useModules()
  const { pendingCount } = useUrgentCount()
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex pb-safe">
        {navItems(modules).map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-1"
            >
              <div className="relative">
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center transition-opacity ${isActive ? 'opacity-100' : 'opacity-35'}`}>
                  <Icon className="h-4 w-4 text-white" strokeWidth={2} />
                </div>
                {item.href === '/settings' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] leading-none transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
