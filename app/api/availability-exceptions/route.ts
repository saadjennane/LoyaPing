import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/availability-exceptions — list all (future + today)
export async function GET() {
  try {
    const db = createServerClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await db
      .from('availability_exceptions')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .gte('end_date', today)
      .order('start_date', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/availability-exceptions — create new exception
export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date, start_time, end_time, label } = await req.json()

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: 'end_date must be >= start_date' }, { status: 400 })
    }
    if ((start_time && !end_time) || (!start_time && end_time)) {
      return NextResponse.json({ error: 'Both start_time and end_time must be provided together' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('availability_exceptions')
      .insert({
        business_id: DEFAULT_BUSINESS_ID,
        start_date,
        end_date,
        start_time: start_time ?? null,
        end_time: end_time ?? null,
        label: label ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
