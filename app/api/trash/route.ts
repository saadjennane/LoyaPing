import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const ORDER_SELECT = '*, client:clients(id, civility, first_name, last_name, phone_number)'
const APPT_SELECT  = '*, client:clients(id, civility, first_name, last_name, phone_number)'

// GET /api/trash — list soft-deleted orders and appointments
export async function GET() {
  try {
    const db = createServerClient()

    const [ordersRes, apptsRes] = await Promise.all([
      db
        .from('orders')
        .select(ORDER_SELECT)
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      db
        .from('appointments')
        .select(APPT_SELECT)
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
    ])

    return NextResponse.json({
      data: {
        orders:       ordersRes.data  ?? [],
        appointments: apptsRes.data   ?? [],
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/trash — restore or permanently delete
export async function POST(req: NextRequest) {
  try {
    const { action, type, id } = await req.json()

    if (!action || !type || !id) {
      return NextResponse.json({ error: 'action, type, and id are required' }, { status: 400 })
    }

    const db = createServerClient()
    const table = type === 'order' ? 'orders' : 'appointments'

    if (action === 'restore') {
      const { error } = await db.from(table).update({ deleted_at: null }).eq('id', id)
      if (error) throw error
      return NextResponse.json({ data: { success: true } })
    }

    if (action === 'delete') {
      const { error } = await db.from(table).delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ data: { success: true } })
    }

    return NextResponse.json({ error: 'Invalid action. Use "restore" or "delete"' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
