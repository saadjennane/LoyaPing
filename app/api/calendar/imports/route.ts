import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/calendar/imports — list unmatched Google Calendar events
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('calendar_imports')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('start_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/calendar/imports — assign a client to an import → creates a proper appointment
// Body: { id: string, client_id: string }
export async function PATCH(req: NextRequest) {
  try {
    const { id, client_id } = await req.json()
    if (!id || !client_id) {
      return NextResponse.json({ error: 'id and client_id are required' }, { status: 400 })
    }

    const db = createServerClient()

    // Fetch the import row
    const { data: imp, error: fetchErr } = await db
      .from('calendar_imports')
      .select('*')
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!imp) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

    // Create the appointment
    const { data: appt, error: insertErr } = await db
      .from('appointments')
      .insert({
        client_id,
        business_id:  DEFAULT_BUSINESS_ID,
        scheduled_at: imp.start_at,
        ended_at:     imp.end_at ?? null,
        notes:        imp.summary ?? null,
        status:       'scheduled',
        google_event_id: imp.event_id,
      })
      .select('id')
      .single()
    if (insertErr) throw insertErr

    // Delete the import
    await db.from('calendar_imports').delete().eq('id', id)

    return NextResponse.json({ data: { appointment_id: appt.id } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
