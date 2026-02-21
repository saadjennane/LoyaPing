import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/settings/hours — returns 7 rows ordered by day_of_week
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('business_hours')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('day_of_week', { ascending: true })

    if (error) throw error

    // If no rows, return defaults (Mon-Sat open 09-18, Sun closed)
    if (!data || data.length === 0) {
      const defaults = Array.from({ length: 7 }, (_, i) => ({
        business_id: DEFAULT_BUSINESS_ID,
        day_of_week: i + 1,
        is_closed:   i === 6,
        slot1_start: i === 6 ? null : '09:00',
        slot1_end:   i === 6 ? null : '18:00',
        slot2_start: null,
        slot2_end:   null,
      }))
      return NextResponse.json({ data: defaults })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/settings/hours — upsert all 7 days
export async function PATCH(req: NextRequest) {
  try {
    const { hours } = await req.json()

    if (!Array.isArray(hours) || hours.length !== 7) {
      return NextResponse.json({ error: 'Expected 7 day entries' }, { status: 400 })
    }

    const rows = hours.map((h: {
      day_of_week: number
      is_closed: boolean
      slot1_start?: string | null
      slot1_end?: string | null
      slot2_start?: string | null
      slot2_end?: string | null
    }) => ({
      business_id: DEFAULT_BUSINESS_ID,
      day_of_week: h.day_of_week,
      is_closed:   h.is_closed,
      slot1_start: h.is_closed ? null : (h.slot1_start || null),
      slot1_end:   h.is_closed ? null : (h.slot1_end   || null),
      slot2_start: h.is_closed ? null : (h.slot2_start || null),
      slot2_end:   h.is_closed ? null : (h.slot2_end   || null),
    }))

    const db = createServerClient()
    const { error } = await db
      .from('business_hours')
      .upsert(rows, { onConflict: 'business_id,day_of_week' })

    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
