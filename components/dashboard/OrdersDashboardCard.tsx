'use client'

import { ShoppingBag, Clock, AlertTriangle, Plus } from 'lucide-react'
import type { DashboardOrdersSection } from '@/lib/types'

type Props = { data: DashboardOrdersSection }

function MetricPill({
  value,
  label,
  accent,
}: {
  value: number
  label: string
  accent?: 'orange' | 'red'
}) {
  const base = 'flex flex-col items-center px-3 py-2 rounded-xl flex-1'
  const color =
    accent === 'red'
      ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400'
      : accent === 'orange'
        ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400'
        : 'bg-muted/40 text-foreground'

  return (
    <div className={`${base} ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-[11px] font-medium mt-0.5 text-center leading-tight">{label}</span>
    </div>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `il y a ${h}h${m > 0 ? m + 'm' : ''}`
  if (m > 0) return `il y a ${m} min`
  return "à l\u2019instant"
}

export default function OrdersDashboardCard({ data }: Props) {
  const { metrics, list } = data
  const hasUncollected = metrics.uncollected_3reminders > 0

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center shrink-0">
          <ShoppingBag className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Commandes</h2>
          <p className="text-xs text-muted-foreground">{metrics.created_today} créée{metrics.created_today !== 1 ? 's' : ''} aujourd&apos;hui</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-2 px-4 py-3 border-b border-border/50">
        <MetricPill value={metrics.ready_count}            label="Prêtes"    accent={metrics.ready_count > 0 ? 'orange' : undefined} />
        <MetricPill value={metrics.pending_count}          label="En attente" />
        <MetricPill value={metrics.uncollected_3reminders} label="3+ rappels" accent={hasUncollected ? 'red' : undefined} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/30 max-h-64">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Plus className="h-5 w-5 mb-1 opacity-40" />
            <span className="text-sm">Aucune commande prête</span>
          </div>
        ) : (
          list.map((order) => {
            const isUrgent = order.reminders_count >= 3
            return (
              <div key={order.id} className="flex items-center gap-3 px-4 py-2.5">
                {isUrgent ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{order.client_name}</p>
                  {order.reference && (
                    <p className="text-xs text-muted-foreground">#{order.reference}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(order.ready_at)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
