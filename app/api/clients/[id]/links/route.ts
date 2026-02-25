import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

// GET /api/clients/[id]/links
// Returns counts of upcoming appointments and orders linked to this client
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()

    const [apptRes, orderRes] = await Promise.all([
      db.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .gte('scheduled_at', new Date().toISOString())
        .is('deleted_at', null),
      db.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id),
    ])

    return NextResponse.json({
      data: {
        upcomingAppointments: apptRes.count ?? 0,
        orders: orderRes.count ?? 0,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
