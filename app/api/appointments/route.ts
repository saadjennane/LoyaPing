import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUpcomingAppointments, getAllAppointments } from '@/lib/services/appointments'
import { scheduleRemindersForAppointment } from '@/lib/services/appointment-reminders'
import { pushAppointmentToGoogle } from '@/lib/services/google-calendar-sync'
import { pushAppointmentToMicrosoft } from '@/lib/services/microsoft-calendar-sync'
import { Appointments } from '@/lib/posthog/appointments'
import {
  applyAppointmentShifts, assertCabinExists, BookingError, checkCabinAvailability, resolveServices, saveAppointmentServices,
  type ResolvedBooking,
} from '@/lib/services/catalog'
import { reserveGiftCard } from '@/lib/services/gift-cards'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  try {
    // One client's appointments (most recent first), e.g. to link a gift card
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (clientId) {
      const db = createServerClient()
      const { data, error } = await db
        .from('appointments')
        .select('id, scheduled_at, ended_at, status, services:appointment_services(name, position)')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    const all = req.nextUrl.searchParams.get('all') === 'true'
    const appts = all
      ? await getAllAppointments(DEFAULT_BUSINESS_ID)
      : await getUpcomingAppointments(DEFAULT_BUSINESS_ID)
    return NextResponse.json({ data: appts })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, scheduled_at, notes } = body
    const serviceIds: string[] = Array.isArray(body.service_ids) ? body.service_ids : []

    if (!client_id || !scheduled_at) {
      return NextResponse.json({ error: 'client_id and scheduled_at are required' }, { status: 400 })
    }

    const db = createServerClient()
    const start = new Date(scheduled_at)

    // With services: cabin + end are derived from the catalog.
    // Without: the cabin and end time must be given explicitly.
    let cabinId: string
    let end: Date
    let items: ResolvedBooking['items'] = []
    if (serviceIds.length > 0) {
      const booking = await resolveServices(DEFAULT_BUSINESS_ID, serviceIds)
      cabinId = booking.cabinId
      end     = new Date(start.getTime() + booking.duration * 60_000)
      items   = booking.items
    } else {
      if (!body.cabin_id) return NextResponse.json({ error: 'Choisissez un soin ou une cabine' }, { status: 400 })
      if (!body.ended_at) return NextResponse.json({ error: 'L\'heure de fin est requise pour un RDV sans soin' }, { status: 400 })
      await assertCabinExists(db, DEFAULT_BUSINESS_ID, body.cabin_id)
      cabinId = body.cabin_id
      end     = new Date(body.ended_at)
    }
    if (!(end > start)) return NextResponse.json({ error: 'La fin doit être après le début' }, { status: 400 })

    // Overlap with other appointments of the cabin: 409 with details unless the
    // merchant chose to push them back ('shift') or to overlap ('overlap')
    const shifts = await checkCabinAvailability(db, {
      businessId: DEFAULT_BUSINESS_ID, cabinId, start, end, resolution: body.conflict_resolution,
    })

    const { data, error } = await db
      .from('appointments')
      .insert({
        client_id,
        business_id: DEFAULT_BUSINESS_ID,
        scheduled_at: start.toISOString(),
        ended_at: end.toISOString(),
        cabin_id: cabinId,
        notes: notes ?? null,
        status: 'scheduled',
        whatsapp_enabled: body.whatsapp_enabled !== false,
      })
      .select()
      .single()

    if (error) throw error

    // Gift card used for this appointment: reserve it (consumed when marked show)
    if (body.gift_card_id) {
      await reserveGiftCard(db, body.gift_card_id, data.id, DEFAULT_BUSINESS_ID)
        .catch((e) => console.error('[appointments] gift card reserve error:', e))
    }

    try {
      await saveAppointmentServices(db, data.id, items)
    } catch (e) {
      // Roll back so we never keep an appointment without its services
      await db.from('appointments').delete().eq('id', data.id)
      throw e
    }

    // Push back the following appointments (cascade), if requested
    const shiftedIds = shifts.length > 0 ? await applyAppointmentShifts(db, shifts) : []

    // Schedule reminders (best-effort — don't fail the whole request)
    for (const apptId of [data.id, ...shiftedIds]) {
      try {
        await scheduleRemindersForAppointment(apptId, DEFAULT_BUSINESS_ID)
      } catch (e) {
        console.error('[appointments] Failed to schedule reminders:', e)
      }
    }
    for (const apptId of shiftedIds) {
      pushAppointmentToGoogle(apptId, DEFAULT_BUSINESS_ID).catch((e) => console.error('[appointments] Google push failed (shift):', e))
    }

    // Push to connected calendars (best-effort)
    pushAppointmentToGoogle(data.id, DEFAULT_BUSINESS_ID).catch((e) => {
      console.error('[appointments] Google push failed:', e)
    })
    pushAppointmentToMicrosoft(data.id, DEFAULT_BUSINESS_ID).catch((e) => {
      console.error('[appointments] Microsoft push failed:', e)
    })

    Appointments.created({ appointment_id: data.id, has_client: !!client_id })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message, conflict: err.details }, { status: err.status })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
