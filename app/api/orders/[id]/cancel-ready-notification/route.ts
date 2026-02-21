import { NextRequest, NextResponse } from 'next/server'
import { cancelReadyNotification } from '@/lib/services/orders'

type Params = { params: Promise<{ id: string }> }

// POST /api/orders/:id/cancel-ready-notification
// Cancels the pending SCHEDULED READY notification and reverts the order to PENDING.
// Only works within the 10-second undo window.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await cancelReadyNotification(id)
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
