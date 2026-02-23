/**
 * POST /api/scheduled-messages/:id/send-now
 *
 * Called by the UI ~10 seconds after the user triggers an action (e.g.
 * "mark order ready") to send the WhatsApp message immediately rather
 * than waiting for the 60-second cron fallback.
 *
 * Flow:
 *   1. Atomically claim the message (SCHEDULED → PROCESSING).
 *      Returns 409 if it has already been claimed/sent/cancelled.
 *   2. Send via sendWhatsAppMessage().
 *   3. Mark SENT on success, FAILED (with retry logic) on error.
 *   4. On success, update entity-specific timestamps (e.g. orders.ready_sent_at).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { createServerClient } from '@/lib/supabase/server'
import {
  claimMessageNow,
  markSent,
  markFailed,
} from '@/lib/services/outbox'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const claimToken = crypto.randomUUID()

  let claimed
  try {
    claimed = await claimMessageNow(id, claimToken)
  } catch (err) {
    console.error('[send-now] claim error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  if (!claimed) {
    // Message was already PROCESSING, SENT, or CANCELLED.
    return NextResponse.json(
      { error: 'Message cannot be sent: already processing, sent, or cancelled' },
      { status: 409 },
    )
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  try {
    const result = await sendWhatsAppMessage({
      to:   claimed.to_whatsapp,
      text: claimed.body,
    })

    await markSent(claimed.id, claimToken)

    // ── Entity-specific post-send updates ─────────────────────────────────
    if (claimed.message_type === 'order_ready') {
      try {
        const db = createServerClient()
        await db
          .from('orders')
          .update({ ready_sent_at: new Date().toISOString() })
          .eq('id', claimed.entity_id)
      } catch (dbErr) {
        console.error('[send-now] failed to update orders.ready_sent_at', dbErr)
      }
    }

    return NextResponse.json({ data: { sent: true, messageId: result.messageId } })
  } catch (sendErr) {
    const errorMessage = String(sendErr)
    console.error('[send-now] send error', sendErr)

    // markFailed handles retry scheduling internally (attempts < MAX_ATTEMPTS)
    try {
      await markFailed(claimed.id, claimToken, errorMessage)
    } catch (markErr) {
      console.error('[send-now] markFailed error', markErr)
    }

    return NextResponse.json({ error: errorMessage }, { status: 502 })
  }
}
