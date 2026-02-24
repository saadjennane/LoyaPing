import { NextResponse } from 'next/server'
import { syncMicrosoftCalendar } from '@/lib/services/microsoft-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// POST /api/calendar/microsoft/sync — manual sync trigger
export async function POST() {
  try {
    await syncMicrosoftCalendar(DEFAULT_BUSINESS_ID)
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    console.error('[calendar/microsoft/sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
