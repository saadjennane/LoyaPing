import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getValidGoogleToken, startGoogleWatch } from '@/lib/services/google-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// POST /api/calendar/google/watch — create or renew a Google Calendar watch channel
export async function POST() {
  try {
    const db          = createServerClient()
    const accessToken = await getValidGoogleToken(DEFAULT_BUSINESS_ID, db)
    await startGoogleWatch(DEFAULT_BUSINESS_ID, db, accessToken)
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    console.error('[calendar/google/watch]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
