import { NextResponse } from 'next/server'
import { syncMicrosoftCalendar, pushAppointmentToMicrosoft } from '@/lib/services/microsoft-calendar-sync'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// POST /api/calendar/microsoft/sync — bidirectional sync:
//   1. Pull: Outlook → LoyaPing (new/changed/deleted events via delta)
//   2. Push: LoyaPing → Outlook (upcoming appointments not yet in Outlook)
export async function POST() {
  try {
    const db = createServerClient()

    // 0. Cleanup: remove calendar_imports that are duplicates of existing appointments
    const { data: linked } = await db
      .from('appointments')
      .select('microsoft_event_id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .not('microsoft_event_id', 'is', null)
    if (linked && linked.length > 0) {
      const eventIds = linked.map((a) => a.microsoft_event_id).filter(Boolean) as string[]
      await db
        .from('calendar_imports')
        .delete()
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .in('event_id', eventIds)
    }

    // 1. Pull: Outlook → LoyaPing
    await syncMicrosoftCalendar(DEFAULT_BUSINESS_ID)

    // 2. Push: LoyaPing → Outlook
    // Fetch ALL upcoming scheduled appointments (new + existing) to create or update Outlook events
    const { data: appts } = await db
      .from('appointments')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .gte('scheduled_at', new Date().toISOString())

    if (appts && appts.length > 0) {
      await Promise.allSettled(
        appts.map((a) => pushAppointmentToMicrosoft(a.id, DEFAULT_BUSINESS_ID)),
      )
    }

    return NextResponse.json({ data: { success: true, pushed: appts?.length ?? 0 } })
  } catch (err) {
    console.error('[calendar/microsoft/sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
