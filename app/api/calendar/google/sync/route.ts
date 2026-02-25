import { NextResponse } from 'next/server'
import { syncGoogleCalendar, pushAppointmentToGoogle } from '@/lib/services/google-calendar-sync'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// POST /api/calendar/google/sync — bidirectional sync:
//   1. Pull: Google → LoyaPing (new/changed/deleted events)
//   2. Push: LoyaPing → Google (upcoming appointments not yet in Google)
export async function POST() {
  try {
    const db = createServerClient()

    // 1. Pull: Google → LoyaPing
    await syncGoogleCalendar(DEFAULT_BUSINESS_ID)

    // 2. Push: LoyaPing → Google
    // Fetch all upcoming scheduled appointments that don't have a google_event_id yet
    const { data: appts } = await db
      .from('appointments')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .is('google_event_id', null)
      .gte('scheduled_at', new Date().toISOString())

    if (appts && appts.length > 0) {
      await Promise.allSettled(
        appts.map((a) => pushAppointmentToGoogle(a.id, DEFAULT_BUSINESS_ID)),
      )
    }

    return NextResponse.json({ data: { success: true, pushed: appts?.length ?? 0 } })
  } catch (err) {
    console.error('[calendar/google/sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
