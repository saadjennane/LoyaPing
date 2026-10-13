// Slot computation for the service catalog (soins + cabines).
// Pure functions — safe to import from client components and server code.

export type BusinessHourRow = {
  day_of_week: number         // 1=Lun … 7=Dim
  is_closed: boolean
  slot1_start: string | null  // 'HH:MM'
  slot1_end: string | null
  slot2_start: string | null
  slot2_end: string | null
}

// Interval in minutes from local midnight, end exclusive
export type MinuteInterval = { start: number; end: number }

// Start times are proposed every SLOT_STEP_MINUTES
export const SLOT_STEP_MINUTES = 15

// Duration assumed for legacy appointments without ended_at
export const FALLBACK_APPT_DURATION = 60

// Statuses that occupy a cabin. reschedule_requested frees the slot.
export const CABIN_BLOCKING_STATUSES = ['scheduled', 'confirmed', 'show', 'no_show'] as const

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minsToLabel(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`
}

/** Opening windows of a day, e.g. [[540, 780], [840, 1140]] for 9h–13h / 14h–19h. */
export function openingWindows(bh: BusinessHourRow | undefined): MinuteInterval[] {
  if (!bh || bh.is_closed) return []
  const windows: MinuteInterval[] = []
  if (bh.slot1_start && bh.slot1_end) windows.push({ start: timeToMins(bh.slot1_start), end: timeToMins(bh.slot1_end) })
  if (bh.slot2_start && bh.slot2_end) windows.push({ start: timeToMins(bh.slot2_start), end: timeToMins(bh.slot2_end) })
  return windows
}

/**
 * Start times (minutes from midnight) at which a block of `duration` minutes
 * fits entirely inside one opening window without overlapping `busy`.
 * Starts are aligned on `step` within each window.
 */
export function freeStartTimes({
  windows,
  duration,
  busy,
  minStart = 0,
  step = SLOT_STEP_MINUTES,
}: {
  windows: MinuteInterval[]
  duration: number
  busy: MinuteInterval[]
  minStart?: number
  step?: number
}): number[] {
  if (duration <= 0) return []
  const starts: number[] = []
  for (const w of windows) {
    for (let t = w.start; t + duration <= w.end; t += step) {
      if (t < minStart) continue
      const end = t + duration
      if (busy.some((b) => t < b.end && end > b.start)) continue
      starts.push(t)
    }
  }
  return starts
}

/** An appointment without cabin (legacy) blocks every cabin. */
export function blocksCabin(apptCabinId: string | null, cabinId: string | null): boolean {
  return apptCabinId === null || cabinId === null || apptCabinId === cabinId
}

/** Do two [start, end) instants overlap? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

/** End of an appointment, falling back to FALLBACK_APPT_DURATION when ended_at is missing. */
export function appointmentEnd(scheduledAt: string, endedAt: string | null): Date {
  return endedAt
    ? new Date(endedAt)
    : new Date(new Date(scheduledAt).getTime() + FALLBACK_APPT_DURATION * 60_000)
}

/** 30 → "30 min", 60 → "1h", 90 → "1h30" */
export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}
