'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, Calendar, Users, Gift, Settings,
} from 'lucide-react'

type Modules = {
  orders_enabled:       boolean
  appointments_enabled: boolean
  loyalty_enabled:      boolean
}

export default function SidebarNav({ modules }: { modules: Modules }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/',             icon: LayoutDashboard, label: 'Accueil',      show: true },
    { href: '/orders',       icon: ShoppingBag,     label: 'Commandes',    show: modules.orders_enabled },
    { href: '/appointments', icon: Calendar,        label: 'Rendez-vous',  show: modules.appointments_enabled },
    { href: '/clients',      icon: Users,           label: 'Clients',      show: true },
    { href: '/coupons',      icon: Gift,            label: 'Fidélité',     show: modules.loyalty_enabled },
    { href: '/settings',     icon: Settings,        label: 'Paramètres',   show: true },
  ].filter(item => item.show)

  return (
    <nav className="flex-1 p-3 space-y-0.5">
      {navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#EEF2FF] text-[#3B5BDB]'
                : 'text-[#6B7280] hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
