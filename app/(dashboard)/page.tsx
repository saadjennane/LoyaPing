'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, ShoppingBag, Calendar, Ticket,
  AlertTriangle, Clock, CheckCircle2, XCircle, Sparkles, ArrowRight, CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { DashboardSummary } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayLabel() {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const now  = new Date()
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (date.toDateString() === now.toDateString()) return time

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `hier ${time}`

  const dayMonth = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (date.getFullYear() === now.getFullYear()) return `${dayMonth} ${time}`

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function SkeletonFocus() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-pulse flex">
      <div className="w-1 bg-muted shrink-0" />
      <div className="flex-1 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted" />
            <div className="space-y-1.5">
              <div className="h-2 w-16 bg-muted rounded" />
              <div className="h-4 w-28 bg-muted rounded" />
            </div>
          </div>
          <div className="h-8 w-36 bg-muted rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 bg-muted/50 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}

function SkeletonSecondary() {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-muted" />
          <div className="h-3.5 w-20 bg-muted rounded" />
        </div>
        <div className="w-4 h-4 bg-muted rounded" />
      </div>
      <div className="flex gap-2 px-3 py-3 border-b border-border/50">
        {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-14 bg-muted/40 rounded-lg" />)}
      </div>
      <div className="space-y-px">
        {[0, 1].map((i) => <div key={i} className="h-8 bg-muted/20 mx-3 my-2 rounded" />)}
      </div>
    </div>
  )
}

// ── Focus Cards ───────────────────────────────────────────────────────────────

const APPT_META = {
  scheduled: { Icon: Clock,         color: 'text-muted-foreground/40' },
  show:      { Icon: CheckCircle2,  color: 'text-green-500' },
  no_show:   { Icon: XCircle,       color: 'text-red-400' },
} as const

function FocusOrders({
  data,
  onMarkReady,
}: {
  data: NonNullable<DashboardSummary['orders']>
  onMarkReady?: (id: string) => Promise<void>
}) {
  const router = useRouter()
  const { metrics, list } = data
  const hasUncollected = metrics.uncollected_3reminders > 0
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex">
      <div className="w-1 bg-orange-400 shrink-0" />
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-[18px] w-[18px] text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-1">Focus du jour</p>
              <h2 className="text-base font-bold text-foreground leading-none">Commandes</h2>
            </div>
          </div>
          <Link href="/orders">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button onClick={() => router.push('/orders?filter=ready')} className="bg-orange-50 dark:bg-orange-950/40 rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{metrics.ready_count}</p>
            <p className="text-[11px] font-medium text-orange-700/70 dark:text-orange-400/70 mt-0.5">Prêtes</p>
          </button>
          <button onClick={() => router.push('/orders?filter=pending')} className="bg-muted/40 rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer">
            <p className="text-2xl font-bold text-foreground">{metrics.pending_count}</p>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">En attente</p>
          </button>
          <button onClick={() => router.push('/orders?filter=non_retrieved')} className={`rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer ${hasUncollected ? 'bg-red-50 dark:bg-red-950/40' : 'bg-muted/40'}`}>
            <p className={`text-2xl font-bold ${hasUncollected ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.uncollected_3reminders}</p>
            <p className={`text-[11px] font-medium mt-0.5 ${hasUncollected ? 'text-red-700/70 dark:text-red-400/70' : 'text-muted-foreground'}`}>3+ rappels</p>
          </button>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-1">Aucune commande en cours</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, 3).map((order) => (
              <div
                key={order.id}
                className="bg-muted/30 rounded-xl p-3 flex items-center gap-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/orders?id=${order.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {order.reminders_count >= 3 && order.status === 'ready' && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate">{order.client_name}</span>
                    {order.reference && (
                      <span className="text-xs text-muted-foreground shrink-0">#{order.reference}</span>
                    )}
                  </div>
                  {order.status === 'ready' && order.ready_at && (
                    <div className="text-xs text-muted-foreground mt-0.5">{formatDateTime(order.ready_at)}</div>
                  )}
                </div>
                {order.status === 'pending' ? (
                  <Button
                    size="sm"
                    className="h-7 text-xs shrink-0 bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white gap-1"
                    onClick={(e) => { e.stopPropagation(); onMarkReady?.(order.id) }}
                  >
                    <CheckCircle className="h-3 w-3" />Prête
                  </Button>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0">
                    Prête
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FocusAppointments({ data }: { data: NonNullable<DashboardSummary['appointments']> }) {
  const { metrics, list } = data
  const nextLabel = metrics.next_at ? formatTime(metrics.next_at) : '—'
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex">
      <div className="w-1 bg-violet-400 shrink-0" />
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center shrink-0">
              <Calendar className="h-[18px] w-[18px] text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-1">Focus du jour</p>
              <h2 className="text-base font-bold text-foreground leading-none">Rendez-vous</h2>
            </div>
          </div>
          <Link href="/appointments">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-violet-50 dark:bg-violet-950/40 rounded-xl px-3 py-3 text-center">
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{metrics.today_count}</p>
            <p className="text-[11px] font-medium text-violet-700/70 dark:text-violet-400/70 mt-0.5">Aujourd&apos;hui</p>
          </div>
          <div className={`rounded-xl px-3 py-3 text-center ${metrics.next_at ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-muted/40'}`}>
            <p className={`text-2xl font-bold ${metrics.next_at ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{nextLabel}</p>
            <p className={`text-[11px] font-medium mt-0.5 ${metrics.next_at ? 'text-emerald-700/70 dark:text-emerald-400/70' : 'text-muted-foreground'}`}>Prochain</p>
          </div>
          <div className={`rounded-xl px-3 py-3 text-center ${metrics.no_show_today > 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-muted/40'}`}>
            <p className={`text-2xl font-bold ${metrics.no_show_today > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.no_show_today}</p>
            <p className={`text-[11px] font-medium mt-0.5 ${metrics.no_show_today > 0 ? 'text-red-700/70 dark:text-red-400/70' : 'text-muted-foreground'}`}>Absences</p>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-1">Aucun RDV aujourd&apos;hui</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, 3).map((appt) => {
              const meta = APPT_META[appt.status] ?? APPT_META.scheduled
              const Icon = meta.Icon
              return (
                <Link key={appt.id} href={`/appointments?id=${appt.id}`} className="bg-muted/30 rounded-xl p-3 flex items-center gap-2.5 hover:bg-muted/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{appt.client_name}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(appt.scheduled_at)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FocusLoyalty({ data }: { data: NonNullable<DashboardSummary['loyalty']> }) {
  const router = useRouter()
  const { metrics, list } = data
  const hasExpiring = metrics.expiring_soon > 0
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex">
      <div className="w-1 bg-amber-400 shrink-0" />
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
              <Ticket className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-1">Focus du jour</p>
              <h2 className="text-base font-bold text-foreground leading-none">Fidélité</h2>
            </div>
          </div>
          <Link href="/coupons">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0">
              Voir tout <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button onClick={() => router.push('/coupons?filter=active')} className="bg-amber-50 dark:bg-amber-950/40 rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.active_coupons}</p>
            <p className="text-[11px] font-medium text-amber-700/70 dark:text-amber-400/70 mt-0.5">Actifs</p>
          </button>
          <button onClick={() => router.push('/coupons?filter=birthday')} className="bg-muted/40 rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer">
            <p className="text-2xl font-bold text-foreground">{metrics.birthday_coupons}</p>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Anniversaires</p>
          </button>
          <button onClick={() => router.push('/coupons?filter=expiring')} className={`rounded-xl px-3 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer ${hasExpiring ? 'bg-red-50 dark:bg-red-950/40' : 'bg-muted/40'}`}>
            <p className={`text-2xl font-bold ${hasExpiring ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.expiring_soon}</p>
            <p className={`text-[11px] font-medium mt-0.5 ${hasExpiring ? 'text-red-700/70 dark:text-red-400/70' : 'text-muted-foreground'}`}>Expirent bientôt</p>
          </button>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-1">Aucun coupon actif</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, 3).map((coupon) => (
              <Link key={coupon.id} href={`/coupons?id=${coupon.id}`} className="bg-muted/30 rounded-xl p-3 flex items-center gap-2.5 hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{coupon.client_name}</p>
                  {coupon.reward_title && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{coupon.reward_title}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Secondary Cards ───────────────────────────────────────────────────────────

function SecondaryOrders({
  data,
  onMarkReady,
}: {
  data: NonNullable<DashboardSummary['orders']>
  onMarkReady?: (id: string) => Promise<void>
}) {
  const router = useRouter()
  const { metrics, list } = data
  const hasUncollected = metrics.uncollected_3reminders > 0
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center">
            <ShoppingBag className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
          </div>
          <span className="text-sm font-semibold text-foreground">Commandes</span>
        </div>
        <Link href="/orders" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Voir tout <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex gap-2 px-3 py-3 border-b border-border/50">
        <button onClick={() => router.push('/orders?filter=ready')} className="flex-1 bg-orange-50 dark:bg-orange-950/30 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer">
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{metrics.ready_count}</p>
          <p className="text-[10px] text-orange-700/60 dark:text-orange-400/60 font-medium mt-0.5">Prêtes</p>
        </button>
        <button onClick={() => router.push('/orders?filter=pending')} className="flex-1 bg-muted/40 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer">
          <p className="text-xl font-bold text-foreground">{metrics.pending_count}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Attente</p>
        </button>
        <button onClick={() => router.push('/orders?filter=non_retrieved')} className={`flex-1 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer ${hasUncollected ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'}`}>
          <p className={`text-xl font-bold ${hasUncollected ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.uncollected_3reminders}</p>
          <p className={`text-[10px] font-medium mt-0.5 ${hasUncollected ? 'text-red-700/60 dark:text-red-400/60' : 'text-muted-foreground'}`}>Urgents</p>
        </button>
      </div>
      <div className="space-y-1.5 p-3">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Aucune commande en cours</p>
        ) : list.slice(0, 2).map((order) => (
          <div
            key={order.id}
            className="bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/orders?id=${order.id}`)}
          >
            {order.reminders_count >= 3 && order.status === 'ready'
              ? <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
              : <Clock className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            <span className="flex-1 text-xs font-medium text-foreground truncate">{order.client_name}</span>
            {order.status === 'pending' ? (
              <Button
                size="sm"
                className="h-5 text-[10px] shrink-0 bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white px-1.5 gap-0.5"
                onClick={(e) => { e.stopPropagation(); onMarkReady?.(order.id) }}
              >
                <CheckCircle className="h-2.5 w-2.5" />Prête
              </Button>
            ) : (
              <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(order.ready_at)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SecondaryAppointments({ data }: { data: NonNullable<DashboardSummary['appointments']> }) {
  const { metrics, list } = data
  const nextLabel = metrics.next_at ? formatTime(metrics.next_at) : '—'
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center">
            <Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-foreground">Rendez-vous</span>
        </div>
        <Link href="/appointments" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Voir tout <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex gap-2 px-3 py-3 border-b border-border/50">
        <div className="flex-1 bg-violet-50 dark:bg-violet-950/30 rounded-lg px-2 py-2 text-center">
          <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{metrics.today_count}</p>
          <p className="text-[10px] text-violet-700/60 dark:text-violet-400/60 font-medium mt-0.5">Auj.</p>
        </div>
        <div className={`flex-1 rounded-lg px-2 py-2 text-center ${metrics.next_at ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted/40'}`}>
          <p className={`text-xl font-bold ${metrics.next_at ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{nextLabel}</p>
          <p className={`text-[10px] font-medium mt-0.5 ${metrics.next_at ? 'text-emerald-700/60 dark:text-emerald-400/60' : 'text-muted-foreground'}`}>Prochain</p>
        </div>
        <div className={`flex-1 rounded-lg px-2 py-2 text-center ${metrics.no_show_today > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'}`}>
          <p className={`text-xl font-bold ${metrics.no_show_today > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.no_show_today}</p>
          <p className={`text-[10px] font-medium mt-0.5 ${metrics.no_show_today > 0 ? 'text-red-700/60 dark:text-red-400/60' : 'text-muted-foreground'}`}>Absences</p>
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Aucun RDV aujourd&apos;hui</p>
        ) : list.slice(0, 2).map((appt) => {
          const meta = APPT_META[appt.status] ?? APPT_META.scheduled
          const Icon = meta.Icon
          return (
            <Link key={appt.id} href={`/appointments?id=${appt.id}`} className="bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              <Icon className={`h-3 w-3 ${meta.color} shrink-0`} />
              <span className="flex-1 text-xs font-medium text-foreground truncate">{appt.client_name}</span>
              <span className="text-[10px] font-medium text-muted-foreground shrink-0">{formatTime(appt.scheduled_at)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SecondaryLoyalty({ data }: { data: NonNullable<DashboardSummary['loyalty']> }) {
  const router = useRouter()
  const { metrics, list } = data
  const hasExpiring = metrics.expiring_soon > 0
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
            <Ticket className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-foreground">Fidélité</span>
        </div>
        <Link href="/coupons" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Voir tout <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex gap-2 px-3 py-3 border-b border-border/50">
        <button onClick={() => router.push('/coupons?filter=active')} className="flex-1 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer">
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{metrics.active_coupons}</p>
          <p className="text-[10px] text-amber-700/60 dark:text-amber-400/60 font-medium mt-0.5">Actifs</p>
        </button>
        <button onClick={() => router.push('/coupons?filter=birthday')} className="flex-1 bg-muted/40 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer">
          <p className="text-xl font-bold text-foreground">{metrics.birthday_coupons}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Anniversaires</p>
        </button>
        <button onClick={() => router.push('/coupons?filter=expiring')} className={`flex-1 rounded-lg px-2 py-2 text-center hover:opacity-80 transition-opacity cursor-pointer ${hasExpiring ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'}`}>
          <p className={`text-xl font-bold ${hasExpiring ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{metrics.expiring_soon}</p>
          <p className={`text-[10px] font-medium mt-0.5 ${hasExpiring ? 'text-red-700/60 dark:text-red-400/60' : 'text-muted-foreground'}`}>Expirent bientôt</p>
        </button>
      </div>
      <div className="space-y-1.5 p-3">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Aucun coupon actif</p>
        ) : list.slice(0, 2).map((coupon) => (
          <Link key={coupon.id} href={`/coupons?id=${coupon.id}`} className="bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
            <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="flex-1 text-xs font-medium text-foreground truncate">{coupon.client_name}</span>
            {coupon.reward_title && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0 max-w-[90px] truncate">{coupon.reward_title}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

type ActivityType = 'order_ready' | 'order_urgent' | 'appt_scheduled' | 'appt_show' | 'appt_noshow' | 'coupon'

const ACTIVITY_META: Record<ActivityType, { dot: string; label: string; href: string }> = {
  order_ready:    { dot: 'bg-orange-400', label: 'Commande prête',   href: '/orders' },
  order_urgent:   { dot: 'bg-red-500',    label: 'Commande urgente', href: '/orders' },
  appt_scheduled: { dot: 'bg-violet-400', label: 'RDV prévu',        href: '/appointments' },
  appt_show:      { dot: 'bg-emerald-400',label: 'RDV honoré',       href: '/appointments' },
  appt_noshow:    { dot: 'bg-red-400',    label: 'Absence',          href: '/appointments' },
  coupon:         { dot: 'bg-amber-400',  label: 'Coupon débloqué',  href: '/coupons' },
}

function buildActivityFeed(summary: DashboardSummary) {
  const items: { id: string; type: ActivityType; client_name: string; detail?: string; time?: string; ts: number }[] = []

  if (summary.orders) {
    for (const order of summary.orders.list.filter(o => o.status === 'ready').slice(0, 3)) {
      const ts = order.ready_at ? new Date(order.ready_at).getTime() : Date.now() - 60_000
      items.push({
        id: `o-${order.id}`,
        type: order.reminders_count >= 3 ? 'order_urgent' : 'order_ready',
        client_name: order.client_name,
        detail: order.reference ? `#${order.reference}` : undefined,
        time: formatDateTime(order.ready_at),
        ts,
      })
    }
  }

  if (summary.appointments) {
    for (const appt of summary.appointments.list.slice(0, 3)) {
      const ts = new Date(appt.scheduled_at).getTime()
      items.push({
        id: `a-${appt.id}`,
        type: appt.status === 'no_show' ? 'appt_noshow' : appt.status === 'show' ? 'appt_show' : 'appt_scheduled',
        client_name: appt.client_name,
        time: formatTime(appt.scheduled_at),
        ts,
      })
    }
  }

  if (summary.loyalty) {
    for (const coupon of summary.loyalty.list.slice(0, 2)) {
      items.push({
        id: `c-${coupon.id}`,
        type: 'coupon',
        client_name: coupon.client_name,
        detail: coupon.reward_title ?? undefined,
        ts: 0,
      })
    }
  }

  return items.sort((a, b) => b.ts - a.ts).slice(0, 5)
}

function ActivityFeed({ summary }: { summary: DashboardSummary }) {
  const items = buildActivityFeed(summary)
  if (items.length === 0) return null
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">Activité récente</h3>
      </div>
      <div className="divide-y divide-border/30">
        {items.map((item) => {
          const meta = ACTIVITY_META[item.type]
          return (
            <Link
              key={item.id}
              href={meta.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">{item.client_name}</span>
                <span className="text-sm text-muted-foreground"> · {meta.label}</span>
                {item.detail && <span className="text-sm text-muted-foreground"> · {item.detail}</span>}
              </div>
              {item.time && <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useI18n()
  const [summary, setSummary]     = useState<DashboardSummary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/dashboard/summary')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSummary(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const markReadyFromDashboard = async (id: string) => {
    const res = await fetch(`/api/orders/${id}/ready`, { method: 'PATCH' })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Commande marquée prête !')
    load(true)
  }

  // Which module is the "focus" (first enabled wins)
  const mods = summary?.business.modules
  const focusModule: 'orders' | 'appointments' | 'loyalty' =
    mods?.orders_enabled       ? 'orders'
    : mods?.appointments_enabled ? 'appointments'
    : 'loyalty'

  // Secondary = all enabled modules except the focus one
  const secondaryModules = (['orders', 'appointments', 'loyalty'] as const).filter((m) => {
    if (!summary) return false
    if (m === focusModule) return false
    if (m === 'orders'       && !summary.business.modules.orders_enabled)       return false
    if (m === 'appointments' && !summary.business.modules.appointments_enabled) return false
    if (m === 'loyalty'      && !summary.business.modules.loyalty_enabled)      return false
    return true
  })

  const secondaryGridClass = secondaryModules.length === 1
    ? 'grid grid-cols-1'
    : 'grid grid-cols-1 md:grid-cols-2'

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">{todayLabel()}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {t('dashboard.error', { message: error })}
        </div>
      )}

      {/* 1 — Focus du Jour */}
      {loading ? (
        <SkeletonFocus />
      ) : summary ? (
        <>
          {focusModule === 'orders'       && summary.orders       && <FocusOrders       data={summary.orders}       onMarkReady={markReadyFromDashboard} />}
          {focusModule === 'appointments' && summary.appointments && <FocusAppointments data={summary.appointments} />}
          {focusModule === 'loyalty'      && summary.loyalty      && <FocusLoyalty      data={summary.loyalty} />}
        </>
      ) : null}

      {/* 2 — Modules secondaires */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonSecondary />
          <SkeletonSecondary />
        </div>
      ) : summary && secondaryModules.length > 0 ? (
        <div className={`${secondaryGridClass} gap-4`}>
          {secondaryModules.map((m) => (
            <div key={m}>
              {m === 'orders'       && summary.orders       && <SecondaryOrders       data={summary.orders}       onMarkReady={markReadyFromDashboard} />}
              {m === 'appointments' && summary.appointments && <SecondaryAppointments data={summary.appointments} />}
              {m === 'loyalty'      && summary.loyalty      && <SecondaryLoyalty      data={summary.loyalty} />}
            </div>
          ))}
        </div>
      ) : null}

      {/* 3 — Activité récente */}
      {!loading && summary && <ActivityFeed summary={summary} />}

    </div>
  )
}
