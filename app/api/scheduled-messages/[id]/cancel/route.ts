/**
 * POST /api/scheduled-messages/:id/cancel
 *
 * Cancels a scheduled message only if it is still in SCHEDULED status.
 *
 * Response:
 *   200 { cancelled: true }  — successfully cancelled
 *   409 { cancelled: false, reason: 'already_processing_or_sent' }
 *       — message was already claimed by a worker or sent; caller must NOT
 *         revert the order status and should offer a correction message instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cancelScheduledMessage } from '@/lib/services/outbox'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const { cancelled } = await cancelScheduledMessage(id)

    if (!cancelled) {
      return NextResponse.json(
        { cancelled: false, reason: 'already_processing_or_sent' },
        { status: 409 },
      )
    }

    return NextResponse.json({ cancelled: true })
  } catch (err) {
    console.error('[scheduled-messages/cancel]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
