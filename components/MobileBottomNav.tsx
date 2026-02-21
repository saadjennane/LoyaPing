'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingBag, Calendar, Users, Gift, Settings } from 'lucide-react'
import { useModules } from '@/lib/context/modules'

export default function MobileBottomNav() {
  const { modules } = useModules()
  const pathname = usePathname()

  const navItems = [
    { href: '/',             icon: LayoutDashboard, label: 'Dashboard',    show: true },
    { href: '/clients',      icon: Users,           label: 'Clients',      show: true },
    { href: '/orders',       icon: ShoppingBag,     label: 'Commandes',    show: modules.orders_enabled },
    { href: '/appointments', icon: Calendar,        label: 'RDV',          show: modules.appointments_enabled },
    { href: '/coupons',      icon: Gift,            label: 'Fidélité',     show: modules.loyalty_enabled },
    { href: '/settings',     icon: Settings,        label: 'Paramètres',   show: true },
  ].filter(item => item.show)

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex pb-safe">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
