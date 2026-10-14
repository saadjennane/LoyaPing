import { NextRequest, NextResponse } from 'next/server'
import { markAppointmentShow, markNoShow } from '@/lib/services/appointments'
import { createServerClient } from '@/lib/supabase/server'
import { Appointments } from '@/lib/posthog/appointments'
import { cancelPendingReminders, scheduleRemindersForAppointment } from '@/lib/services/appointment-reminders'
import { pushAppointmentToGoogle, deleteGoogleEvent } from '@/lib/services/google-calendar-sync'
import { pushAppointmentToMicrosoft, deleteMicrosoftEvent } from '@/lib/services/microsoft-calendar-sync'
import { reverseSourceCredit } from '@/lib/services/loyalty'
import { createAndNotifyUrgentEvent } from '@/lib/services/urgent-notifications'
import { assertCabinFree, BookingError } from '@/lib/services/catalog'
import { cancelAllScheduledForEntity } from '@/lib/services/outbox'
import { appointmentEnd } from '@/lib/scheduling/slots'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// GET /api/appointments/:id — fetch single appointment
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { data, error } = await db
      .from('appointments')
      .select('*, client:clients(first_name, last_name, phone_number), services:appointment_services(*)')
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, amount, scheduled_at, client_id } = body

    // ── WhatsApp toggle for this appointment ────────────────────────────────
    // Off: cancel every queued message (reminders, post-visit).
    // On: reschedule the reminders that are still in the future.
    if (typeof body.whatsapp_enabled === 'boolean') {
      const db = createServerClient()
      const { error } = await db
        .from('appointments')
        .update({ whatsapp_enabled: body.whatsapp_enabled })
        .eq('id', id)
        .eq('business_id', DEFAULT_BUSINESS_ID)
      if (error) throw error
      if (body.whatsapp_enabled) {
        await scheduleRemindersForAppointment(id, DEFAULT_BUSINESS_ID)
      } else {
        await cancelAllScheduledForEntity('appointment', id)
      }
      return NextResponse.json({ data: { id, whatsapp_enabled: body.whatsapp_enabled } })
    }

    // ── Force override (silent correction) ──────────────────────────────────
    // Corrects a wrong status (show↔no_show↔scheduled) without triggering
    // points logic or WhatsApp messages. Useful for data-entry mistakes.
    // The outbox is NOT touched — any pending SCHEDULED post messages are left
    // as-is and will fire unless the caller cancels them separately.
    // For normal appointment flow, omit force and use status='show'/'no_show'.
    if (body.force && ['show', 'no_show', 'scheduled'].includes(status)) {
      const db = createServerClient()
      const now = new Date().toISOString()
      const updates: Record<string, string | boolean | null> = { status }
      if (status === 'show')      { updates.show_at = now; updates.no_show_at = null }
      if (status === 'no_show')   { updates.no_show_at = now; updates.show_at = null }
      if (status === 'scheduled') { updates.show_at = null; updates.no_show_at = null }

      // When reverting to scheduled: reverse any points credited for this appointment
      if (status === 'scheduled') {
        const { data: appt } = await db
          .from('appointments')
          .select('points_credited, client_id, business_id')
          .eq('id', id)
          .maybeSingle()

        if (appt?.points_credited && appt.client_id) {
          await reverseSourceCredit({
            clientId:   appt.client_id,
            businessId: appt.business_id ?? DEFAULT_BUSINESS_ID,
            sourceType: 'appointment',
            sourceId:   id,
          }).catch((e) => console.error('[appointments] Failed to reverse points:', e))
          updates.points_credited = false
        }
      }

      const { error } = await db.from('appointments').update(updates).eq('id', id)
      if (error) throw error
      return NextResponse.json({ data: { id, status, forced: true, whatsappQueued: false } })
    }

    if (status === 'show') {
      const result = await markAppointmentShow(id, amount ?? undefined)
      const appt = result as unknown as Record<string, unknown>
      const scheduledAt = appt.scheduled_at as string | null
      const timeToCompletion = scheduledAt
        ? Math.round((Date.now() - new Date(scheduledAt).getTime()) / 60_000)
        : null
      const remindersCount = (appt.reminders_count as number | null) ?? 0
      Appointments.markedCompleted({
        appointment_id:             id,
        completed_after_reminder:   remindersCount,
        time_to_completion_minutes: timeToCompletion,
      })
      return NextResponse.json({ data: result })
    }

    if (status === 'no_show') {
      await markNoShow(id)
      Appointments.markedNoShow({ appointment_id: id, completed_after_reminder: 0 })
      return NextResponse.json({ data: { id, status: 'no_show' } })
    }

    // ── Confirm appointment (WhatsApp button "Je confirme") ─────────────────
    if (status === 'confirmed') {
      const db = createServerClient()
      const now = new Date().toISOString()
      const { error } = await db
        .from('appointments')
        .update({ status: 'confirmed', confirmed_at: now })
        .eq('id', id)
        .eq('business_id', DEFAULT_BUSINESS_ID)
      if (error) throw error
      // Log event (best-effort)
      db.from('appointment_events').insert({ appointment_id: id, type: 'confirmed' }).then(() => {})
      return NextResponse.json({ data: { id, status: 'confirmed' } })
    }

    // ── Request reschedule (WhatsApp button "Replanifier") ──────────────────
    if (status === 'reschedule_requested') {
      const db = createServerClient()
      const now = new Date().toISOString()

      // Fetch current scheduled_at to store as previous date/time
      const { data: current } = await db
        .from('appointments')
        .select('scheduled_at')
        .eq('id', id)
        .maybeSingle()

      const updates: Record<string, string | null> = {
        status: 'reschedule_requested',
        reschedule_requested_at: now,
      }
      if (current?.scheduled_at) {
        const d = new Date(current.scheduled_at)
        updates.stored_previous_date = d.toISOString().slice(0, 10)
        updates.stored_previous_time = d.toISOString().slice(11, 19)
      }

      const { error } = await db
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .eq('business_id', DEFAULT_BUSINESS_ID)
      if (error) throw error

      // Cancel pending reminders — slot is now free
      try { await cancelPendingReminders(id) } catch (e) {
        console.error('[appointments] Failed to cancel reminders on reschedule_requested:', e)
      }

      // Log event (best-effort)
      db.from('appointment_events').insert({ appointment_id: id, type: 'reschedule_requested' }).then(() => {})

      // Urgent notification (best-effort)
      createAndNotifyUrgentEvent('reschedule', id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[appointments] Urgent notification failed:', e)
      })

      return NextResponse.json({ data: { id, status: 'reschedule_requested' } })
    }

    // Reschedule: update scheduled_at (+ ended_at if provided), cancel old reminders, schedule new ones
    if (scheduled_at) {
      const db = createServerClient()
      const { data: current } = await db
        .from('appointments')
        .select('cabin_id, scheduled_at, ended_at, services:appointment_services(duration_minutes)')
        .eq('id', id)
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle()
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      // End time: services total > explicit ended_at > previous duration kept
      const start = new Date(scheduled_at)
      const servicesDuration = ((current.services ?? []) as Array<{ duration_minutes: number }>)
        .reduce((sum, s) => sum + s.duration_minutes, 0)
      let end: Date | null
      if (servicesDuration > 0) {
        end = new Date(start.getTime() + servicesDuration * 60_000)
      } else if ('ended_at' in body) {
        end = body.ended_at ? new Date(body.ended_at) : null
      } else {
        end = current.ended_at
          ? new Date(start.getTime() + (new Date(current.ended_at).getTime() - new Date(current.scheduled_at).getTime()))
          : null
      }
      if (end && !(end > start)) {
        return NextResponse.json({ error: 'La fin doit être après le début' }, { status: 400 })
      }

      await assertCabinFree(db, {
        businessId: DEFAULT_BUSINESS_ID,
        cabinId:    current.cabin_id,
        start,
        end:        end ?? appointmentEnd(start.toISOString(), null),
        excludeAppointmentId: id,
      })

      const updateFields: Record<string, string | null> = {
        scheduled_at: start.toISOString(),
        ended_at:     end ? end.toISOString() : null,
      }
      // If rescheduling from reschedule_requested, reset to scheduled and clear previous
      updateFields.status = 'scheduled'
      updateFields.stored_previous_date = null
      updateFields.stored_previous_time = null

      const { error } = await db
        .from('appointments')
        .update(updateFields)
        .eq('id', id)
        .in('status', ['scheduled', 'confirmed', 'reschedule_requested'])

      if (error) throw error

      // Cancel pending reminders then schedule new ones (best-effort)
      try {
        await cancelPendingReminders(id)
        await scheduleRemindersForAppointment(id, DEFAULT_BUSINESS_ID)
      } catch (e) {
        console.error('[appointments] Failed to reschedule reminders:', e)
      }

      // Push updated time to connected calendars (best-effort)
      pushAppointmentToGoogle(id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[appointments] Google push failed on reschedule:', e)
      })
      pushAppointmentToMicrosoft(id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[appointments] Microsoft push failed on reschedule:', e)
      })

      return NextResponse.json({ data: { id, scheduled_at } })
    }

    // Assign a client to an unassigned appointment (client_id was null)
    // Do NOT push to Google/Outlook — the original calendar event is considered
    // the source of truth and must not be modified after a client is assigned.
    if (client_id) {
      const db = createServerClient()
      const { error } = await db
        .from('appointments')
        .update({ client_id })
        .eq('id', id)
        .eq('business_id', DEFAULT_BUSINESS_ID)
      if (error) throw error
      return NextResponse.json({ data: { id, client_id } })
    }

    return NextResponse.json({ error: 'Invalid payload. Use status "show"/"no_show", provide scheduled_at, or provide client_id.' }, { status: 400 })
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/appointments/:id — soft delete + cancel future reminders + remove Google event
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()

    // Fetch calendar event IDs before deleting
    const { data: appt } = await db
      .from('appointments')
      .select('google_event_id, microsoft_event_id')
      .eq('id', id)
      .maybeSingle()

    const { error } = await db
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    // Cancel any SCHEDULED outbox reminders for this appointment (best-effort).
    try {
      const { cancelAppointmentReminders } = await import('@/lib/services/appointment-reminders')
      await cancelAppointmentReminders(id)
    } catch (e) {
      console.error('[appointments] Failed to cancel reminders on delete:', e)
    }

    // Delete the corresponding calendar events (best-effort)
    if (appt?.google_event_id) {
      deleteGoogleEvent(appt.google_event_id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[appointments] Google event delete failed:', e)
      })
    }
    if (appt?.microsoft_event_id) {
      deleteMicrosoftEvent(appt.microsoft_event_id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[appointments] Microsoft event delete failed:', e)
      })
    }

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
