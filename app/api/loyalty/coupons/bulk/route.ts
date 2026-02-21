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
    // Verify coupons belong to this business via tier join
    const { error } = await db
      .from('coupons')
      .delete()
      .in('id', ids)
    if (error) throw error
    return NextResponse.json({ data: { success: true, count: ids.length } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { ids, action, extend_days } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }

    const db = createServerClient()

    if (action === 'reactivate') {
      // Reactivate expired coupons: set status back to active, extend expiry by extend_days
      const days = typeof extend_days === 'number' && extend_days > 0 ? extend_days : 30

      // Fetch current expiry dates
      const { data: coupons, error: fetchErr } = await db
        .from('coupons')
        .select('id, expires_at')
        .in('id', ids)
      if (fetchErr) throw fetchErr

      const now = new Date()
      for (const c of coupons ?? []) {
        const base = new Date(c.expires_at) > now ? new Date(c.expires_at) : now
        const newExpiry = new Date(base)
        newExpiry.setDate(newExpiry.getDate() + days)
        await db.from('coupons').update({
          status: 'active',
          expires_at: newExpiry.toISOString(),
        }).eq('id', c.id)
      }

      return NextResponse.json({ data: { success: true, count: ids.length } })
    }

    if (action === 'extend') {
      // Extend expiry by N days without changing status
      const days = typeof extend_days === 'number' && extend_days > 0 ? extend_days : 7

      const { data: coupons, error: fetchErr } = await db
        .from('coupons')
        .select('id, expires_at')
        .in('id', ids)
      if (fetchErr) throw fetchErr

      for (const c of coupons ?? []) {
        const newExpiry = new Date(c.expires_at)
        newExpiry.setDate(newExpiry.getDate() + days)
        await db.from('coupons').update({ expires_at: newExpiry.toISOString() }).eq('id', c.id)
      }

      return NextResponse.json({ data: { success: true, count: ids.length } })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
