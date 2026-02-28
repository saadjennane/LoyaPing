import { NextRequest, NextResponse } from 'next/server'
import { markOrderPickedUp, downgradeReadyToPending, downgradeCompletedToReady } from '@/lib/services/orders'
import { createServerClient } from '@/lib/supabase/server'
import { capture } from '@/lib/posthog/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// GET /api/orders/:id — fetch single order
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { data, error } = await db
      .from('orders')
      .select('*, client:clients(first_name, last_name, phone_number)')
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/orders/:id — update status
// Note: marking an order "ready" uses PATCH /api/orders/:id/ready (outbox pattern)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { status } = await req.json()

    // Downgrade READY → PENDING; auto-cancels any SCHEDULED outbox message.
    // Returns { readyMessageSent } so the UI can offer a correction message.
    if (status === 'pending') {
      const result = await downgradeReadyToPending(id)
      return NextResponse.json({ data: result })
    }

    // 'picked_up' kept for compat — both route to markOrderPickedUp which sets status='completed'
    if (status === 'picked_up' || status === 'completed') {
      const result = await markOrderPickedUp(id)
      capture('order_picked_up')
      return NextResponse.json({ data: result })
    }

    // Downgrade COMPLETED → READY; reverts points if credited
    if (status === 'ready_revert') {
      const result = await downgradeCompletedToReady(id)
      return NextResponse.json({ data: result })
    }

    return NextResponse.json({ error: 'Invalid status. Use "pending", "picked_up", or "ready_revert". To mark as ready use PATCH /api/orders/:id/ready.' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/orders/:id — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
