/**
 * Service catalog (soins) + cabins, and cabin-level booking rules.
 *
 * Rules:
 *   - An appointment holds 1+ services, all from the same cabin.
 *   - Its duration is the sum of the service durations (cleaning included).
 *   - Two appointments cannot overlap in the same cabin. Legacy appointments
 *     without cabin block every cabin.
 */

import { createServerClient } from '@/lib/supabase/server'
import { appointmentEnd, blocksCabin, CABIN_BLOCKING_STATUSES, overlaps } from '@/lib/scheduling/slots'
import type { Cabin, Service } from '@/lib/types'

type Db = ReturnType<typeof createServerClient>

const DEFAULT_CABINS = ['Cabine visage', 'Cabine 2']

/** Error carrying the HTTP status the route should return. */
export class BookingError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message)
  }
}

// ── Cabins ────────────────────────────────────────────────────────────────────

/** Active cabins, ordered. Seeds the default cabins the first time. */
export async function listCabins(businessId: string): Promise<Cabin[]> {
  const db = createServerClient()

  const fetchActive = () => db
    .from('cabins')
    .select('id, business_id, name, sort_order, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const { data, error } = await fetchActive()
  if (error) throw error
  if (data && data.length > 0) return data as Cabin[]

  // Seed only if the business never had any cabin (not even deleted ones)
  const { count } = await db
    .from('cabins')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
  if ((count ?? 0) > 0) return []

  const { error: seedError } = await db
    .from('cabins')
    .insert(DEFAULT_CABINS.map((name, i) => ({ business_id: businessId, name, sort_order: i })))
  if (seedError) throw seedError

  const { data: seeded, error: refetchError } = await fetchActive()
  if (refetchError) throw refetchError
  return (seeded ?? []) as Cabin[]
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function listServices(businessId: string, { activeOnly = false } = {}): Promise<Service[]> {
  const db = createServerClient()
  let query = db
    .from('services')
    .select('id, business_id, cabin_id, name, price, duration_minutes, sort_order, is_active, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Service[]).map((s) => ({ ...s, price: Number(s.price) }))
}

export type ResolvedBooking = {
  cabinId:  string
  duration: number   // minutes
  price:    number
  items:    Array<{ service_id: string; name: string; price: number; duration_minutes: number }>
}

/**
 * Validates the selected services (exist, active, same cabin) and computes
 * total duration and price. Order of `serviceIds` is preserved.
 */
export async function resolveServices(businessId: string, serviceIds: string[]): Promise<ResolvedBooking> {
  if (serviceIds.length === 0) throw new BookingError('Sélectionnez au moins un soin', 400)

  const db = createServerClient()
  const { data, error } = await db
    .from('services')
    .select('id, cabin_id, name, price, duration_minutes')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('id', serviceIds)
  if (error) throw error

  const byId = new Map((data ?? []).map((s) => [s.id as string, s]))
  const items = serviceIds.map((id) => {
    const s = byId.get(id)
    if (!s) throw new BookingError('Soin introuvable ou désactivé', 400)
    return {
      service_id:       s.id as string,
      name:             s.name as string,
      price:            Number(s.price),
      duration_minutes: s.duration_minutes as number,
      cabin_id:         s.cabin_id as string,
    }
  })

  const cabinIds = new Set(items.map((i) => i.cabin_id))
  if (cabinIds.size > 1) {
    throw new BookingError('Tous les soins d\'un RDV doivent être dans la même cabine', 400)
  }

  return {
    cabinId:  items[0].cabin_id,
    duration: items.reduce((sum, i) => sum + i.duration_minutes, 0),
    price:    items.reduce((sum, i) => sum + i.price, 0),
    items:    items.map((i) => ({
      service_id:       i.service_id,
      name:             i.name,
      price:            i.price,
      duration_minutes: i.duration_minutes,
    })),
  }
}

export async function assertCabinExists(db: Db, businessId: string, cabinId: string): Promise<void> {
  const { data } = await db
    .from('cabins')
    .select('id')
    .eq('id', cabinId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) throw new BookingError('Cabine introuvable', 400)
}

/** Replaces the services snapshot of an appointment. */
export async function saveAppointmentServices(
  db: Db,
  appointmentId: string,
  items: ResolvedBooking['items'],
): Promise<void> {
  const { error: delError } = await db.from('appointment_services').delete().eq('appointment_id', appointmentId)
  if (delError) throw delError
  if (items.length === 0) return
  const { error } = await db
    .from('appointment_services')
    .insert(items.map((it, position) => ({ appointment_id: appointmentId, position, ...it })))
  if (error) throw error
}

// ── Cabin conflicts ──────────────────────────────────────────────────────────

export type ConflictResolution = 'shift' | 'overlap'

export type CabinConflictInfo = {
  conflicts: Array<{ id: string; scheduled_at: string; ended_at: string; client_name: string }>
  // Cascade plan: following appointments pushed back until a gap absorbs the delay.
  // null when shifting is impossible (an overlapping appointment starts earlier
  // or is already past), only "overlap" is then offered.
  shifts: Array<{ id: string; client_name: string; from: string; to: string; new_end: string }> | null
}

export type AppointmentShift = { id: string; scheduled_at: string; ended_at: string }

// Statuses an appointment can be pushed back from
const SHIFTABLE_STATUSES = ['scheduled', 'confirmed']

function clientLabel(c: { first_name?: string | null; last_name?: string | null; phone_number?: string | null } | null): string {
  if (!c) return 'Sans client'
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number || 'Client sans nom'
}

/**
 * Checks [start, end) against the other appointments occupying the cabin
 * (cabinId = null — legacy — conflicts with every cabin).
 *
 * - No conflict → returns [] (nothing to shift).
 * - Conflict and no `resolution` → throws a 409 BookingError whose `details`
 *   (CabinConflictInfo) list the conflicts and the cascade plan.
 * - resolution 'overlap' → returns [] (the merchant handles it).
 * - resolution 'shift' → returns the shifts to apply (after saving the edited
 *   appointment) with applyAppointmentShifts().
 */
export async function checkCabinAvailability(
  db: Db,
  {
    businessId,
    cabinId,
    start,
    end,
    excludeAppointmentId,
    resolution,
  }: {
    businessId: string
    cabinId: string | null
    start: Date
    end: Date
    excludeAppointmentId?: string
    resolution?: ConflictResolution
  },
): Promise<AppointmentShift[]> {
  // Overlaps start at most a day before; a cascade stays within the next day
  const lowerBound = new Date(start.getTime() - 24 * 60 * 60_000)
  const upperBound = new Date(end.getTime() + 24 * 60 * 60_000)

  let query = db
    .from('appointments')
    .select('id, cabin_id, status, scheduled_at, ended_at, client:clients(first_name, last_name, phone_number)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .in('status', [...CABIN_BLOCKING_STATUSES])
    .gt('scheduled_at', lowerBound.toISOString())
    .lt('scheduled_at', upperBound.toISOString())
    .order('scheduled_at', { ascending: true })
  if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId)

  const { data, error } = await query
  if (error) throw error

  type Row = {
    id: string; cabin_id: string | null; status: string; scheduled_at: string; ended_at: string | null
    client: { first_name: string | null; last_name: string | null; phone_number: string | null } | null
  }
  const sameCabin = ((data ?? []) as unknown as Row[])
    .filter((a) => blocksCabin(a.cabin_id, cabinId))
    .map((a) => ({
      ...a,
      start: new Date(a.scheduled_at),
      end:   appointmentEnd(a.scheduled_at, a.ended_at),
      name:  clientLabel(Array.isArray(a.client) ? a.client[0] : a.client),
    }))

  const conflicts = sameCabin.filter((a) => overlaps(a.start, a.end, start, end))
  if (conflicts.length === 0 || resolution === 'overlap') return []

  // Cascade: push each following appointment right after the previous one
  // until one already starts after the cursor (a gap absorbs the delay)
  let shifts: AppointmentShift[] | null = []
  if (conflicts.some((a) => a.start < start || !SHIFTABLE_STATUSES.includes(a.status))) {
    shifts = null
  } else {
    let cursor = end
    for (const a of sameCabin.filter((x) => x.start >= start)) {
      if (a.start >= cursor) break
      if (!SHIFTABLE_STATUSES.includes(a.status)) { shifts = null; break }
      const duration = a.end.getTime() - a.start.getTime()
      const newEnd = new Date(cursor.getTime() + duration)
      shifts.push({ id: a.id, scheduled_at: cursor.toISOString(), ended_at: newEnd.toISOString() })
      cursor = newEnd
    }
  }

  if (resolution === 'shift' && shifts) return shifts

  const byId = new Map(sameCabin.map((a) => [a.id, a]))
  const info: CabinConflictInfo = {
    conflicts: conflicts.map((a) => ({ id: a.id, scheduled_at: a.scheduled_at, ended_at: a.end.toISOString(), client_name: a.name })),
    shifts: shifts && shifts.map((sh) => ({
      id: sh.id,
      client_name: byId.get(sh.id)!.name,
      from: byId.get(sh.id)!.scheduled_at,
      to: sh.scheduled_at,
      new_end: sh.ended_at,
    })),
  }
  throw new BookingError(
    resolution === 'shift'
      ? 'Impossible de repousser les RDV suivants : un RDV qui chevauche commence avant ou est déjà passé'
      : 'Ce créneau chevauche d\'autres RDV dans cette cabine',
    409,
    info,
  )
}

/** Moves appointments (cascade plan) and returns their ids. */
export async function applyAppointmentShifts(db: Db, shifts: AppointmentShift[]): Promise<string[]> {
  for (const sh of shifts) {
    const { error } = await db
      .from('appointments')
      .update({ scheduled_at: sh.scheduled_at, ended_at: sh.ended_at })
      .eq('id', sh.id)
    if (error) throw error
  }
  return shifts.map((sh) => sh.id)
}
