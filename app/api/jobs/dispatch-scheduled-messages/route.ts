/**
 * GET /api/jobs/dispatch-scheduled-messages
 *
 * Cron worker — runs every minute via Vercel Cron.
 * Dispatches all due SCHEDULED outbox messages (send_at <= now).
 *
 * Safety guarantees:
 *   - FOR UPDATE SKIP LOCKED (inside claim_due_scheduled_messages RPC) ensures
 *     two overlapping cron invocations claim disjoint sets of rows.
 *   - claim_token stored on each row means only the claiming worker can
 *     transition it to SENT/FAILED, preventing stale-run interference.
 *   - markFailed reschedules with exponential backoff (up to MAX_ATTEMPTS = 3),
 *     then permanently marks FAILED so dead messages are auditable.
 *
 * Idempotency:
 *   Calling this endpoint multiple times is safe. The SKIP LOCKED + status
 *   guard ensures each row is processed exactly once per lifecycle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { claimDueMessages, markSent, markFailed } from '@/lib/services/outbox'

// Messages per cron invocation. Keep small to stay within Vercel's
// 10-second function timeout on the Hobby plan.
const BATCH_SIZE = 20

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret')

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const claimToken = crypto.randomUUID()
  let sent = 0
  let failed = 0

  try {
    const messages = await claimDueMessages(BATCH_SIZE, claimToken)

    // Process each claimed message sequentially to keep DB connections low.
    // For high-volume, switch to Promise.allSettled with a concurrency limit.
    for (const msg of messages) {
      try {
        const result = await sendWhatsAppMessage({
          to:   msg.to_whatsapp,
          text: msg.body,
        })

        await markSent(msg.id, claimToken)

        console.log(
          `[dispatch] SENT ${msg.id} (${msg.entity_type}/${msg.message_type})`,
          result.messageId,
        )
        sent++
      } catch (sendErr) {
        const errorMessage = String(sendErr)
        console.error(
          `[dispatch] FAILED ${msg.id} (${msg.entity_type}/${msg.message_type}):`,
          errorMessage,
        )

        try {
          await markFailed(msg.id, claimToken, errorMessage)
        } catch (markErr) {
          console.error('[dispatch] markFailed error', markErr)
        }

        failed++
      }
    }

    return NextResponse.json({
      ok:        true,
      claimed:   messages.length,
      sent,
      failed,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[dispatch] fatal error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
