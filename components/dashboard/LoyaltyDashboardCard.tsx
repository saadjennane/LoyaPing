'use client'

import { Ticket, Sparkles } from 'lucide-react'
import type { DashboardLoyaltySection } from '@/lib/types'

type Props = { data: DashboardLoyaltySection }

function MetricPill({
  value,
  label,
  accent,
}: {
  value: number
  label: string
  accent?: 'amber' | 'blue'
}) {
  const base = 'flex flex-col items-center px-3 py-2 rounded-xl flex-1'
  const color =
    accent === 'amber'
      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
      : accent === 'blue'
        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
        : 'bg-muted/40 text-foreground'

  return (
    <div className={`${base} ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-[11px] font-medium mt-0.5 text-center leading-tight">{label}</span>
    </div>
  )
}

function expiresLabel(iso: string | null): string {
  if (!iso) return 'Sans expiry'
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0) return 'Expiré'
  if (diff === 0) return 'Expire auj.'
  if (diff === 1) return 'Expire demain'
  if (diff <= 7) return `${diff}j restants`
  return `Exp. ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
}

export default function LoyaltyDashboardCard({ data }: Props) {
  const { metrics, list } = data

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
          <Ticket className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Fidélité</h2>
          <p className="text-xs text-muted-foreground">
            {metrics.unlocked_today > 0
              ? `${metrics.unlocked_today} coupon${metrics.unlocked_today !== 1 ? 's' : ''} débloqué${metrics.unlocked_today !== 1 ? 's' : ''} aujourd\u2019hui`
              : "Aucun coupon débloqué aujourd\u2019hui"}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-2 px-4 py-3 border-b border-border/50">
        <MetricPill value={metrics.active_coupons}      label="Coupons actifs"  accent={metrics.active_coupons > 0 ? 'amber' : undefined} />
        <MetricPill value={metrics.unlocked_today}      label="Aujourd&apos;hui" accent={metrics.unlocked_today > 0 ? 'amber' : undefined} />
        <MetricPill value={metrics.clients_with_points} label="Clients actifs"  accent={metrics.clients_with_points > 0 ? 'blue' : undefined} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/30 max-h-64">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Ticket className="h-5 w-5 mb-1 opacity-40" />
            <span className="text-sm">Aucun coupon actif</span>
          </div>
        ) : (
          list.map((coupon) => (
            <div key={coupon.id} className="flex items-center gap-3 px-4 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{coupon.client_name}</p>
                {coupon.reward_title && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{coupon.reward_title}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{expiresLabel(coupon.expires_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
