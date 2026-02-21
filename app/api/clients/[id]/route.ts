import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { updateClientPhone } from '@/lib/services/clients'
import { undoLastCredit } from '@/lib/services/loyalty'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const detail = req.nextUrl.searchParams.get('detail') === 'true'
    const db = createServerClient()

    if (!detail) {
      const { data, error } = await db.from('clients').select('*').eq('id', id).single()
      if (error) throw error
      return NextResponse.json({ data })
    }

    // Full detail: tiers, active coupons, all orders, all appointments, points log
    const [tiersRes, couponsRes, ordersRes, apptsRes, logRes] = await Promise.all([
      db.from('loyalty_tiers')
        .select('*')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .order('tier_order', { ascending: true }),
      db.from('coupons')
        .select('*, tier:loyalty_tiers(*)')
        .eq('client_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      db.from('orders')
        .select('*, messages:order_messages(*)')
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
      db.from('appointments')
        .select('*')
        .eq('client_id', id)
        .order('scheduled_at', { ascending: false }),
      db.from('points_log')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    return NextResponse.json({
      data: {
        tiers:        tiersRes.data   ?? [],
        coupons:      couponsRes.data ?? [],
        orders:       ordersRes.data  ?? [],
        appointments: apptsRes.data   ?? [],
        pointsLog:    logRes.data     ?? [],
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()

    // ── Update basic info (civility, first/last name, email) ───────────────
    if (body.action === 'update_info') {
      const updates: Record<string, string | null> = {}
      if ('civility'   in body) updates.civility   = body.civility   || null
      if ('first_name' in body) updates.first_name = body.first_name || null
      if ('last_name'  in body) updates.last_name  = body.last_name  || null
      if ('email'      in body) updates.email      = body.email      || null
      if ('birthday'   in body) updates.birthday   = body.birthday   || null
      if ('notes'      in body) updates.notes      = body.notes      || null

      const db = createServerClient()
      const { data, error } = await db
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ data })
    }

    // ── Unlock reward: create coupon for a tier ────────────────────────────
    if (body.action === 'unlock_reward' && body.tier_id) {
      const db = createServerClient()
      const { data: tier, error: tierErr } = await db
        .from('loyalty_tiers')
        .select('validity_days')
        .eq('id', body.tier_id)
        .single()
      if (tierErr || !tier) return NextResponse.json({ error: 'Palier introuvable' }, { status: 404 })

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + tier.validity_days)

      const { data, error } = await db
        .from('coupons')
        .insert({ client_id: id, tier_id: body.tier_id, status: 'active', expires_at: expiresAt.toISOString() })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ data })
    }

    // ── Phone number change (regenerates magic token) ──────────────────────
    if (body.phone_number) {
      const client = await updateClientPhone(id, body.phone_number)
      return NextResponse.json({ data: client })
    }

    // ── Undo last credit ───────────────────────────────────────────────────
    if (body.action === 'undo_credit') {
      const result = await undoLastCredit(id, DEFAULT_BUSINESS_ID)
      return NextResponse.json({ data: result })
    }

    // ── Manual points adjustment ───────────────────────────────────────────
    if (typeof body.points_delta === 'number') {
      const db = createServerClient()
      const { data: client } = await db.from('clients').select('*').eq('id', id).single()
      if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })

      await db.from('clients').update({
        loyalty_points:       client.loyalty_points + body.points_delta,
        current_cycle_points: client.current_cycle_points + body.points_delta,
      }).eq('id', id)

      await db.from('points_log').insert({
        client_id:           id,
        business_id:         DEFAULT_BUSINESS_ID,
        source_type:         'manual',
        points_delta:        body.points_delta,
        cycle_points_before: client.current_cycle_points,
        cycle_points_after:  client.current_cycle_points + body.points_delta,
      })

      return NextResponse.json({ data: { success: true } })
    }

    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db.from('clients').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
