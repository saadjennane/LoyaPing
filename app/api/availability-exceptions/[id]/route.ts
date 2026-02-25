import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/availability-exceptions/:id — update
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { start_date, end_date, start_time, end_time, label } = await req.json()

    if (end_date && start_date && end_date < start_date) {
      return NextResponse.json({ error: 'end_date must be >= start_date' }, { status: 400 })
    }

    const db = createServerClient()
    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() }
    if (start_date !== undefined) updates.start_date = start_date
    if (end_date   !== undefined) updates.end_date   = end_date
    if (start_time !== undefined) updates.start_time = start_time ?? null
    if (end_time   !== undefined) updates.end_time   = end_time   ?? null
    if (label      !== undefined) updates.label      = label      ?? null

    const { data, error } = await db
      .from('availability_exceptions')
      .update(updates)
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .select()
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/availability-exceptions/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()

    const { error } = await db
      .from('availability_exceptions')
      .delete()
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)

    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
