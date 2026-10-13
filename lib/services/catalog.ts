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
  constructor(message: string, public status: number) {
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

/**
 * Throws a 409 BookingError if [start, end) overlaps another appointment
 * occupying the same cabin. `cabinId = null` (legacy) conflicts with every cabin.
 */
export async function assertCabinFree(
  db: Db,
  {
    businessId,
    cabinId,
    start,
    end,
    excludeAppointmentId,
  }: {
    businessId: string
    cabinId: string | null
    start: Date
    end: Date
    excludeAppointmentId?: string
  },
): Promise<void> {
  // Any overlapping appointment starts before `end` and (at most a day) before `start`
  const lowerBound = new Date(start.getTime() - 24 * 60 * 60_000)

  let query = db
    .from('appointments')
    .select('id, cabin_id, scheduled_at, ended_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .in('status', [...CABIN_BLOCKING_STATUSES])
    .lt('scheduled_at', end.toISOString())
    .gt('scheduled_at', lowerBound.toISOString())
  if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId)

  const { data, error } = await query
  if (error) throw error

  const conflict = (data ?? []).find((a) =>
    blocksCabin(a.cabin_id as string | null, cabinId) &&
    overlaps(new Date(a.scheduled_at as string), appointmentEnd(a.scheduled_at as string, a.ended_at as string | null), start, end),
  )
  if (conflict) {
    throw new BookingError('Ce créneau n\'est plus disponible dans cette cabine', 409)
  }
}
