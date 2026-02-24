import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getValidMicrosoftToken } from '@/lib/services/microsoft-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'
const GRAPH_API = 'https://graph.microsoft.com/v1.0'

// GET /api/calendar/microsoft/calendars
// Returns the list of Outlook calendars the user has access to,
// plus the currently selected calendar_id from calendar_watch_channels.
export async function GET() {
  try {
    const db    = createServerClient()
    const token = await getValidMicrosoftToken(DEFAULT_BUSINESS_ID, db)

    const res = await fetch(
      `${GRAPH_API}/me/calendars?$top=250`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!res.ok) {
      throw new Error(`Microsoft calendars error ${res.status}: ${await res.text()}`)
    }

    const json = await res.json()
    const calendars = (json.value ?? []).map((c: {
      id: string
      name: string
      isDefaultCalendar?: boolean
    }) => ({
      id:                c.id,
      name:              c.name,
      isDefaultCalendar: c.isDefaultCalendar ?? false,
    }))

    // Read the currently selected calendar_id
    const { data: channel } = await db
      .from('calendar_watch_channels')
      .select('calendar_id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('provider', 'microsoft')
      .maybeSingle()

    const selectedId = channel?.calendar_id ?? 'primary'

    return NextResponse.json({ data: { calendars, selectedId } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
