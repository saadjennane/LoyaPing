import { NextRequest, NextResponse } from 'next/server'
import { markAppointmentShow, markNoShow } from '@/lib/services/appointments'
import { createServerClient } from '@/lib/supabase/server'
import { cancelPendingReminders, scheduleRemindersForAppointment } from '@/lib/services/appointment-reminders'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, amount, scheduled_at } = body

    // Force status override — used for corrections (show↔no_show↔scheduled)
    // No points logic, no WhatsApp, just a direct DB update with timestamp
    if (body.force && ['show', 'no_show', 'scheduled'].includes(status)) {
      const db = createServerClient()
      const now = new Date().toISOString()
      const updates: Record<string, string | null> = { status }
      if (status === 'show')      { updates.show_at = now; updates.no_show_at = null }
      if (status === 'no_show')   { updates.no_show_at = now; updates.show_at = null }
      if (status === 'scheduled') { updates.show_at = null; updates.no_show_at = null }
      const { error } = await db.from('appointments').update(updates).eq('id', id)
      if (error) throw error
      return NextResponse.json({ data: { id, status } })
    }

    if (status === 'show') {
      const result = await markAppointmentShow(id, amount ?? undefined)
      return NextResponse.json({ data: result })
    }

    if (status === 'no_show') {
      await markNoShow(id)
      return NextResponse.json({ data: { id, status: 'no_show' } })
    }

    // Reschedule: update scheduled_at, cancel old reminders, schedule new ones
    if (scheduled_at) {
      const db = createServerClient()
      const { error } = await db
        .from('appointments')
        .update({ scheduled_at })
        .eq('id', id)
        .eq('status', 'scheduled')

      if (error) throw error

      // Cancel pending reminders then schedule new ones (best-effort)
      try {
        await cancelPendingReminders(id)
        await scheduleRemindersForAppointment(id, DEFAULT_BUSINESS_ID)
      } catch (e) {
        console.error('[appointments] Failed to reschedule reminders:', e)
      }

      return NextResponse.json({ data: { id, scheduled_at } })
    }

    return NextResponse.json({ error: 'Invalid payload. Use status "show"/"no_show" or provide scheduled_at.' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/appointments/:id — soft delete + cancel future reminders
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    // Cancel any SCHEDULED outbox reminders for this appointment (best-effort).
    // If this fails the appointment is already soft-deleted; reminders will be
    // a no-op anyway since the dispatch worker re-validates appointment state.
    try {
      const { cancelAppointmentReminders } = await import('@/lib/services/appointment-reminders')
      await cancelAppointmentReminders(id)
    } catch (e) {
      console.error('[appointments] Failed to cancel reminders on delete:', e)
    }

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
