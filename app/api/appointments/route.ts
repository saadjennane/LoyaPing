import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUpcomingAppointments, getAllAppointments } from '@/lib/services/appointments'
import { scheduleRemindersForAppointment } from '@/lib/services/appointment-reminders'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  try {
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
    const { client_id, scheduled_at, ended_at, notes } = body

    if (!client_id || !scheduled_at) {
      return NextResponse.json({ error: 'client_id and scheduled_at are required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('appointments')
      .insert({
        client_id,
        business_id: DEFAULT_BUSINESS_ID,
        scheduled_at,
        ended_at: ended_at ?? null,
        notes: notes ?? null,
        status: 'scheduled',
      })
      .select()
      .single()

    if (error) throw error

    // Schedule reminders (best-effort — don't fail the whole request)
    try {
      await scheduleRemindersForAppointment(data.id, DEFAULT_BUSINESS_ID)
    } catch (e) {
      console.error('[appointments] Failed to schedule reminders:', e)
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
