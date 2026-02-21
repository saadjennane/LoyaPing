/**
 * POST /api/scheduled-messages/:id/cancel
 *
 * Cancels a scheduled message only if it is still in SCHEDULED status.
 * Returns 409 if the message has already been claimed (PROCESSING),
 * sent (SENT), or was previously cancelled (CANCELLED).
 *
 * The UI calls this when the user clicks "Annuler" within the
 * cancel-window countdown (typically 10 seconds).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cancelScheduledMessage } from '@/lib/services/outbox'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const { cancelled } = await cancelScheduledMessage(id)

    if (!cancelled) {
      // Row was not in SCHEDULED status — too late to cancel.
      return NextResponse.json(
        { error: 'Too late: message is already being sent, has been sent, or was already cancelled' },
        { status: 409 },
      )
    }

    return NextResponse.json({ data: { cancelled: true } })
  } catch (err) {
    console.error('[scheduled-messages/cancel]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
