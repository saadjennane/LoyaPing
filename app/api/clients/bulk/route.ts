import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    const db = createServerClient()
    const { error } = await db
      .from('clients')
      .delete()
      .in('id', ids)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { ids, action, delta } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (action !== 'adjust_points') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (typeof delta !== 'number' || delta === 0) {
      return NextResponse.json({ error: 'delta must be a non-zero number' }, { status: 400 })
    }

    const db = createServerClient()

    // Fetch current points for each client
    const { data: clients, error: fetchErr } = await db
      .from('clients')
      .select('id, loyalty_points, current_cycle_points')
      .in('id', ids)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (fetchErr) throw fetchErr

    // Update each client's points and log the transaction
    const updates = (clients ?? []).map((c) => ({
      id: c.id,
      loyalty_points: Math.max(0, c.loyalty_points + delta),
      current_cycle_points: Math.max(0, c.current_cycle_points + delta),
    }))

    for (const u of updates) {
      await db.from('clients').update({
        loyalty_points: u.loyalty_points,
        current_cycle_points: u.current_cycle_points,
      }).eq('id', u.id)
      await db.from('points_log').insert({
        client_id: u.id,
        business_id: DEFAULT_BUSINESS_ID,
        delta,
        source_type: 'manual',
      })
    }

    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
