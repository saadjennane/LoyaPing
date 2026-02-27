'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Package, CalendarDays, UsersRound, Tag, Settings2,
  ChevronLeft, ChevronRight, Sun, Moon, Monitor, FlaskConical, Star,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useModules } from '@/lib/context/modules'
import { useUrgentCount } from '@/lib/context/urgent-count'

const navItems = (modules: { orders_enabled: boolean; appointments_enabled: boolean; loyalty_enabled: boolean; reviews_enabled: boolean }) => [
  {
    href: '/',
    icon: LayoutGrid,
    label: 'Dashboard',
    gradient: 'from-red-400 to-orange-400',
    show: true,
  },
  {
    href: '/clients',
    icon: UsersRound,
    label: 'Clients',
    gradient: 'from-emerald-400 to-teal-500',
    show: true,
  },
  {
    href: '/orders',
    icon: Package,
    label: 'Commandes',
    gradient: 'from-blue-400 to-cyan-500',
    show: modules.orders_enabled,
  },
  {
    href: '/appointments',
    icon: CalendarDays,
    label: 'RDV',
    gradient: 'from-violet-400 to-purple-500',
    show: modules.appointments_enabled,
  },
  {
    href: '/coupons',
    icon: Tag,
    label: 'Fidélité',
    gradient: 'from-fuchsia-400 to-pink-500',
    show: modules.loyalty_enabled,
  },
  {
    href: '/reviews',
    icon: Star,
    label: 'Reviews',
    gradient: 'from-amber-400 to-yellow-500',
    show: modules.reviews_enabled,
  },
].filter((item) => item.show)

const settingsItem = {
  href: '/settings',
  icon: Settings2,
  label: 'Paramètres',
  gradient: 'from-slate-400 to-slate-600',
}

export default function Sidebar() {
  const { modules } = useModules()
  const { pendingCount } = useUrgentCount()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon  = !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  const themeLabel = !mounted ? 'Système' : theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Système'

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    const prevent = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', prevent, { passive: false })
    return () => el.removeEventListener('wheel', prevent)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const renderItem = (item: typeof settingsItem, key: string) => {
    const Icon = item.icon
    const active = isActive(item.href)
    return (
      <Link
        key={key}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center rounded-xl transition-colors ${
          collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
        } ${active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'}`}
      >
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center`}
          >
            <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
          </div>
          {/* Urgent badge — only on settings item */}
          {item.href === '/settings' && pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </div>
        {!collapsed && (
          <span
            className={`text-sm flex-1 ${
              active ? 'font-semibold text-sidebar-foreground' : 'font-medium text-muted-foreground'
            }`}
          >
            {item.label}
          </span>
        )}
        {/* Inline badge label when expanded */}
        {!collapsed && item.href === '/settings' && pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside
      ref={asideRef}
      className={`hidden lg:flex sticky top-0 h-screen ${
        collapsed ? 'w-[68px]' : 'w-56'
      } transition-all duration-200 bg-sidebar border-r border-sidebar-border flex-col shrink-0 [overflow:clip]`}
    >
      {/* Brand */}
      <div
        className={`flex items-center shrink-0 border-b border-sidebar-border ${
          collapsed ? 'justify-center px-0 py-[18px]' : 'px-4 py-[18px] gap-3'
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B5BDB] to-[#7C3AED] flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">L</span>
        </div>
        {!collapsed && (
          <div>
            <div className="text-base font-bold text-sidebar-foreground leading-tight">LoyaPing</div>
            <div className="text-xs text-muted-foreground">Portail Marchand</div>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 min-h-0 p-3 space-y-1">
        {navItems(modules).map((item) => renderItem(item, item.href))}
      </nav>

      {/* Bottom */}
      <div className="p-3 space-y-1 border-t border-sidebar-border shrink-0">
        {renderItem(settingsItem, 'settings')}

        <button
          onClick={cycleTheme}
          title={themeLabel}
          className={`w-full flex items-center rounded-xl text-muted-foreground hover:bg-sidebar-accent/50 transition-colors ${
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <ThemeIcon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground">
              {themeLabel}
            </span>
          )}
        </button>

        <Link
          href="/onboarding"
          title="Tester l'onboarding"
          className={`w-full flex items-center rounded-xl text-muted-foreground hover:bg-sidebar-accent/50 transition-colors ${
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <FlaskConical className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-xs text-muted-foreground">Onboarding</span>}
        </Link>

        <button
          onClick={toggle}
          className={`w-full flex items-center rounded-xl text-muted-foreground hover:bg-sidebar-accent/50 transition-colors ${
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          }`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs text-muted-foreground">Réduire</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
