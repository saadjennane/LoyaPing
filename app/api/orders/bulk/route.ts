import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function PATCH(req: NextRequest) {
  try {
    const { ids, status } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (status !== 'ready' && status !== 'completed') {
      return NextResponse.json({ error: 'status must be ready or completed' }, { status: 400 })
    }

    const db = createServerClient()
    const now = new Date().toISOString()

    const updates: Record<string, string> = { status }
    if (status === 'ready')     updates.ready_at     = now
    if (status === 'completed') updates.completed_at = now

    const { error } = await db
      .from('orders')
      .update(updates)
      .in('id', ids)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error

    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    const db = createServerClient()
    const { error } = await db
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
