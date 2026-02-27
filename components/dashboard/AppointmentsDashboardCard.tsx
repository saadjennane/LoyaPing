'use client'

import { Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { DashboardApptsSection } from '@/lib/types'

type Props = { data: DashboardApptsSection }

function MetricPill({
  value,
  label,
  accent,
}: {
  value: number | string
  label: string
  accent?: 'green' | 'red'
}) {
  const base = 'flex flex-col items-center px-3 py-2 rounded-xl flex-1'
  const color =
    accent === 'green'
      ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400'
      : accent === 'red'
        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400'
        : 'bg-muted/40 text-foreground'

  return (
    <div className={`${base} ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-[11px] font-medium mt-0.5 text-center leading-tight">{label}</span>
    </div>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_META = {
  scheduled:            { label: 'Prévu',         icon: Clock,        color: 'text-muted-foreground/40' },
  confirmed:            { label: 'Confirmé',       icon: CheckCircle2, color: 'text-emerald-500' },
  reschedule_requested: { label: 'À replanifier', icon: Clock,        color: 'text-orange-400' },
  show:                 { label: 'Présent',        icon: CheckCircle2, color: 'text-green-500' },
  no_show:              { label: 'Absent',         icon: XCircle,      color: 'text-red-400' },
} as const

export default function AppointmentsDashboardCard({ data }: Props) {
  const { metrics, list } = data

  const nextLabel = metrics.next_at
    ? formatTime(metrics.next_at)
    : '—'

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
          <Calendar className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Rendez-vous</h2>
          <p className="text-xs text-muted-foreground">{metrics.tomorrow_count} demain</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-2 px-4 py-3 border-b border-border/50">
        <MetricPill value={metrics.today_count} label="Aujourd&apos;hui" />
        <MetricPill value={nextLabel} label="Prochain" accent={metrics.next_at ? 'green' : undefined} />
        <MetricPill value={metrics.no_show_today} label="Absences" accent={metrics.no_show_today > 0 ? 'red' : undefined} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/30 max-h-64">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Calendar className="h-5 w-5 mb-1 opacity-40" />
            <span className="text-sm">Aucun RDV aujourd&apos;hui</span>
          </div>
        ) : (
          list.map((appt) => {
            const meta = STATUS_META[appt.status]
            const Icon = meta.icon
            return (
              <div key={appt.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className={`h-3.5 w-3.5 ${meta.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{appt.client_name}</p>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  {formatTime(appt.scheduled_at)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
