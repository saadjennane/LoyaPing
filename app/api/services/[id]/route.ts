import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { assertCabinExists, BookingError } from '@/lib/services/catalog'
import { parseServiceFields } from '../validation'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/services/:id  { cabin_id?, name?, price?, duration_minutes?, is_active?, sort_order? }
// Past appointments keep their snapshot — editing a service never changes them.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const parsed = parseServiceFields(await req.json(), { partial: true })
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = createServerClient()
    if (parsed.fields.cabin_id) await assertCabinExists(db, DEFAULT_BUSINESS_ID, parsed.fields.cabin_id)

    const { data, error } = await db
      .from('services')
      .update({ ...parsed.fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .select('id, business_id, cabin_id, name, price, duration_minutes, sort_order, is_active, created_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Soin introuvable' }, { status: 404 })
    return NextResponse.json({ data: { ...data, price: Number(data.price) } })
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/services/:id — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db
      .from('services')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
