import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function PATCH(req: NextRequest) {
  try {
    const { ids, status } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (status !== 'show' && status !== 'no_show') {
      return NextResponse.json({ error: 'status must be show or no_show' }, { status: 400 })
    }

    const db = createServerClient()
    const now = new Date().toISOString()

    const updates: Record<string, string | null> = { status }
    if (status === 'show')    { updates.show_at    = now; updates.no_show_at = null }
    if (status === 'no_show') { updates.no_show_at = now; updates.show_at    = null }

    const { error } = await db
      .from('appointments')
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
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error

    // Cancel SCHEDULED outbox reminders for all deleted appointments (best-effort).
    // Run concurrently — each RPC call is cheap (single UPDATE with WHERE clause).
    try {
      const { cancelAppointmentReminders } = await import('@/lib/services/appointment-reminders')
      await Promise.allSettled(
        (ids as string[]).map((id) => cancelAppointmentReminders(id)),
      )
    } catch (e) {
      console.error('[appointments/bulk] Failed to cancel reminders on delete:', e)
    }

    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
