import { NextRequest, NextResponse } from 'next/server'
import { markOrderPickedUp, downgradeReadyToPending, downgradeCompletedToReady } from '@/lib/services/orders'
import { createServerClient } from '@/lib/supabase/server'
import { Orders } from '@/lib/posthog/orders'

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
      const readyAt = (result as unknown as Record<string, unknown>).ready_at as string | null
      const timeToCollect = readyAt
        ? Math.round((Date.now() - new Date(readyAt).getTime()) / 60_000)
        : null
      const remindersCount = (result as unknown as Record<string, unknown>).reminders_count as number ?? 0
      Orders.orderCollected({
        order_id:                 id,
        time_to_collect_minutes:  timeToCollect,
        total_messages_sent:      remindersCount + (readyAt ? 1 : 0),
        collected_after_reminder: remindersCount > 0,
      })
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
