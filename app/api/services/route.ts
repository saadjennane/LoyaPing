import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { assertCabinExists, BookingError, listServices } from '@/lib/services/catalog'
import { parseServiceFields } from './validation'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/services[?active=true]
export async function GET(req: NextRequest) {
  try {
    const activeOnly = req.nextUrl.searchParams.get('active') === 'true'
    const data = await listServices(DEFAULT_BUSINESS_ID, { activeOnly })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/services  { cabin_id, name, price, duration_minutes }
export async function POST(req: NextRequest) {
  try {
    const parsed = parseServiceFields(await req.json(), { partial: false })
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = createServerClient()
    await assertCabinExists(db, DEFAULT_BUSINESS_ID, parsed.fields.cabin_id as string)

    const { count } = await db
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('cabin_id', parsed.fields.cabin_id as string)
      .is('deleted_at', null)

    const { data, error } = await db
      .from('services')
      .insert({ business_id: DEFAULT_BUSINESS_ID, sort_order: count ?? 0, ...parsed.fields })
      .select('id, business_id, cabin_id, name, price, duration_minutes, sort_order, is_active, created_at')
      .single()
    if (error) throw error
    return NextResponse.json({ data: { ...data, price: Number(data.price) } }, { status: 201 })
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
