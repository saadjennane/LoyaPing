import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/reviews/stats — aggregated counts for KPI cards
export async function GET() {
  try {
    const db = createServerClient()

    const { data, error } = await db
      .from('reviews_events')
      .select('type, treated')
      .eq('business_id', DEFAULT_BUSINESS_ID)

    if (error) throw error

    const events = data ?? []
    const count = (type: string) => events.filter((e) => e.type === type).length

    return NextResponse.json({
      data: {
        request_sent:       count('request_sent'),
        positive_response:  count('positive_response'),
        negative_response:  count('negative_response'),
        google_intent:      count('google_intent'),
        reminder_sent:      count('reminder_sent'),
        untreated_negative: events.filter((e) => e.type === 'negative_response' && !e.treated).length,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
