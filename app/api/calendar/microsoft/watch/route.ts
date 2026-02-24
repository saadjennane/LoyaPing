import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getValidMicrosoftToken, startMicrosoftSubscription } from '@/lib/services/microsoft-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// PATCH /api/calendar/microsoft/watch — change the selected calendar and restart subscription
// Body: { calendar_id: string }
export async function PATCH(req: NextRequest) {
  try {
    const { calendar_id } = await req.json()
    if (!calendar_id) {
      return NextResponse.json({ error: 'calendar_id is required' }, { status: 400 })
    }

    const db = createServerClient()

    // Update calendar_id and clear sync_token to force a full resync on the new calendar
    await db
      .from('calendar_watch_channels')
      .update({ calendar_id, sync_token: null })
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('provider', 'microsoft')

    // Restart the subscription on the new calendar
    const accessToken = await getValidMicrosoftToken(DEFAULT_BUSINESS_ID, db)
    await startMicrosoftSubscription(DEFAULT_BUSINESS_ID, db, accessToken, calendar_id)

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    console.error('[calendar/microsoft/watch PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
