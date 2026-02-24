import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getValidGoogleToken } from '@/lib/services/google-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/calendar/google/calendars
// Returns the list of Google Calendars the user has access to,
// plus the currently selected calendar_id from calendar_watch_channels.
export async function GET() {
  try {
    const db    = createServerClient()
    const token = await getValidGoogleToken(DEFAULT_BUSINESS_ID, db)

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!res.ok) {
      throw new Error(`Google calendarList error ${res.status}: ${await res.text()}`)
    }

    const json = await res.json()
    const calendars = (json.items ?? []).map((c: {
      id: string
      summary: string
      primary?: boolean
      accessRole?: string
    }) => ({
      id:      c.id,
      summary: c.summary,
      primary: c.primary ?? false,
    }))

    // Read the currently selected calendar_id
    const { data: channel } = await db
      .from('calendar_watch_channels')
      .select('calendar_id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('provider', 'google')
      .maybeSingle()

    const selectedId = channel?.calendar_id ?? 'primary'

    return NextResponse.json({ data: { calendars, selectedId } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
