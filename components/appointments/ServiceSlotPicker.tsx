'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { addDays, format, isBefore, isSameDay, startOfDay, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Appointment, Cabin, Service } from '@/lib/types'
import {
  appointmentEnd, blocksCabin, CABIN_BLOCKING_STATUSES, formatDuration, freeStartTimes,
  minsToLabel, openingWindows, timeToMins,
  type BusinessHourRow, type MinuteInterval,
} from '@/lib/scheduling/slots'

export type ExceptionRow = {
  start_date: string         // 'yyyy-MM-dd'
  end_date:   string
  start_time: string | null  // 'HH:MM', null = full day
  end_time:   string | null
}

export type SelectedSlot = { date: Date; startMins: number }

// ─── Service selector ─────────────────────────────────────────────────────────

/**
 * Lets the merchant pick 1+ services. Once a service is picked, only services
 * of the same cabin remain selectable (a RDV happens in a single cabin).
 */
export function ServiceSelector({
  cabins,
  services,
  selectedIds,
  onChange,
  currency,
}: {
  cabins: Cabin[]
  services: Service[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  currency: string
}) {
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is Service => !!s)
  const lockedCabinId = selected[0]?.cabin_id ?? null
  const totalDuration = selected.reduce((sum, s) => sum + s.duration_minutes, 0)
  const totalPrice    = selected.reduce((sum, s) => sum + s.price, 0)

  if (services.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun soin configuré.{' '}
        <a href="/settings/services" className="text-[#3B5BDB] underline">Créer le catalogue</a>
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {/* Selected services */}
      {selected.length > 0 && (
        <div className="space-y-1">
          {selected.map((s, i) => (
            <div key={`${s.id}_${i}`} className="flex items-center gap-2 rounded-md bg-[#EDF2FF] px-2 py-1 text-xs">
              <span className="flex-1 truncate font-medium text-[#3B5BDB]">{s.name}</span>
              <span className="text-muted-foreground">{formatDuration(s.duration_minutes)}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(selectedIds.filter((_, j) => j !== i))}
                aria-label={`Retirer ${s.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex justify-between px-1 text-xs font-semibold">
            <span>Total {formatDuration(totalDuration)}</span>
            <span>{totalPrice} {currency}</span>
          </div>
        </div>
      )}

      {/* Catalog, grouped by cabin */}
      <div className="space-y-2">
        {cabins.map((cabin) => {
          const cabinServices = services.filter((s) => s.cabin_id === cabin.id)
          if (cabinServices.length === 0) return null
          const locked = lockedCabinId !== null && lockedCabinId !== cabin.id
          return (
            <div key={cabin.id} className={locked ? 'opacity-40' : ''}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cabin.name}</p>
              <div className="flex flex-wrap gap-1">
                {cabinServices.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={locked}
                    onClick={() => onChange([...selectedIds, s.id])}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:border-[#3B5BDB] hover:text-[#3B5BDB] disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-inherit transition-colors"
                    title={locked ? 'Un RDV ne peut contenir que des soins d\'une même cabine' : undefined}
                  >
                    + {s.name} <span className="text-muted-foreground">· {formatDuration(s.duration_minutes)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week slot grid ───────────────────────────────────────────────────────────

/** Busy minutes of `day` for `cabinId`, from appointments and partial exceptions. */
function dayBusyIntervals(
  day: Date,
  cabinId: string | null,
  appointments: Appointment[],
  partialExceptions: ExceptionRow[],
  excludeAppointmentId?: string,
): MinuteInterval[] {
  const dayStart = startOfDay(day).getTime()
  const busy: MinuteInterval[] = []

  for (const a of appointments) {
    if (a.deleted_at || a.id === excludeAppointmentId) continue
    if (!(CABIN_BLOCKING_STATUSES as readonly string[]).includes(a.status)) continue
    if (!blocksCabin(a.cabin_id ?? null, cabinId)) continue
    const start = (new Date(a.scheduled_at).getTime() - dayStart) / 60_000
    const end   = (appointmentEnd(a.scheduled_at, a.ended_at).getTime() - dayStart) / 60_000
    if (end <= 0 || start >= 24 * 60) continue
    busy.push({ start: Math.max(0, start), end: Math.min(24 * 60, end) })
  }

  for (const ex of partialExceptions) {
    if (ex.start_time && ex.end_time) busy.push({ start: timeToMins(ex.start_time), end: timeToMins(ex.end_time) })
  }
  return busy
}

export function WeekSlotGrid({
  weekStart,
  onWeekChange,
  businessHours,
  exceptions,
  appointments,
  cabinId,
  duration,
  excludeAppointmentId,
  selected,
  onSelect,
}: {
  weekStart: Date
  onWeekChange: (weekStart: Date) => void
  businessHours: BusinessHourRow[]
  exceptions: ExceptionRow[]
  appointments: Appointment[]
  cabinId: string | null
  duration: number
  excludeAppointmentId?: string
  selected: SelectedSlot | null
  onSelect: (slot: SelectedSlot) => void
}) {
  const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 })
  const canGoBack   = isBefore(currentWeek, weekStart)

  const days = useMemo(() => {
    const now      = new Date()
    const today    = startOfDay(now)
    const nowMins  = now.getHours() * 60 + now.getMinutes()

    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => {
      if (isBefore(date, today)) return { date, kind: 'past' as const, starts: [] }

      const dow = date.getDay() === 0 ? 7 : date.getDay()
      const windows = openingWindows(businessHours.find((h) => h.day_of_week === dow))

      const dateStr = format(date, 'yyyy-MM-dd')
      const dayExceptions = exceptions.filter((ex) => dateStr >= ex.start_date && dateStr <= ex.end_date)
      if (windows.length === 0 || dayExceptions.some((ex) => !ex.start_time)) {
        return { date, kind: 'closed' as const, starts: [] }
      }

      const busy = dayBusyIntervals(date, cabinId, appointments, dayExceptions, excludeAppointmentId)
      const starts = freeStartTimes({
        windows,
        duration,
        busy,
        minStart: isSameDay(date, now) ? nowMins : 0,
      })
      return { date, kind: starts.length > 0 ? 'open' as const : 'full' as const, starts }
    })
  }, [weekStart, businessHours, exceptions, appointments, cabinId, duration, excludeAppointmentId])

  return (
    <div className="space-y-2">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => onWeekChange(addDays(weekStart, -7))}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold">
          {format(weekStart, 'd MMM', { locale: fr })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: fr })}
        </span>
        <button
          type="button"
          onClick={() => onWeekChange(addDays(weekStart, 7))}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Days */}
      <div className="space-y-2">
        {days.map(({ date, kind, starts }) => (
          <div key={date.toISOString()}>
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs font-semibold capitalize ${kind === 'open' ? '' : 'text-muted-foreground'}`}>
                {format(date, 'EEE d MMM', { locale: fr })}
              </span>
              {kind !== 'open' && (
                <span className="text-[10px] text-muted-foreground">
                  {kind === 'past' ? 'Passé' : kind === 'closed' ? 'Fermé' : 'Complet'}
                </span>
              )}
            </div>
            {kind === 'open' && (
              <div className="grid grid-cols-5 gap-1 pt-1">
                {starts.map((m) => {
                  const isSelected = !!selected && isSameDay(selected.date, date) && selected.startMins === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onSelect({ date, startMins: m })}
                      className={`rounded py-1 text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-[#3B5BDB] text-white border-[#3B5BDB]'
                          : 'border-border bg-background hover:bg-[#3B5BDB] hover:text-white hover:border-[#3B5BDB]'
                      }`}
                    >
                      {minsToLabel(m)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
