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

    // 1. Pull: Outlook → LoyaPing
    await syncMicrosoftCalendar(DEFAULT_BUSINESS_ID)

    // 2. Push: LoyaPing → Outlook
    // Fetch all upcoming scheduled appointments that don't have a microsoft_event_id yet
    const { data: appts } = await db
      .from('appointments')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .is('microsoft_event_id', null)
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
