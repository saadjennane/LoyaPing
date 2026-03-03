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
 *   - markFailed reschedules with exponential backoff (up to MAX_ATTEMPTS = 4),
 *     then permanently marks FAILED so dead messages are auditable.
 *
 * Auth: CRON_SECRET environment variable is REQUIRED.
 *   - Missing → 500 (mis-configuration, do not run the job)
 *   - Present but wrong → 401
 * Vercel Cron sends: Authorization: Bearer {CRON_SECRET}
 *
 * Idempotency:
 *   Calling this endpoint multiple times is safe. The SKIP LOCKED + status
 *   guard ensures each row is processed exactly once per lifecycle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { claimDueMessages, markSent, markFailed } from '@/lib/services/outbox'
import { Appointments } from '@/lib/posthog/appointments'

// Messages per cron invocation. Keep small to stay within Vercel's
// 10-second function timeout on the Hobby plan.
const BATCH_SIZE = 20

export async function GET(req: NextRequest) {
  // ── Auth — CRON_SECRET is mandatory ───────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[dispatch] CRON_SECRET is not configured')
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 },
    )
  }

  const auth = req.headers.get('authorization')
  const secret =
    (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ??
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret')

  if (secret !== cronSecret) {
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

        // Analytics — appointment reminder sent
        if (msg.entity_type === 'appointment') {
          const match = msg.message_type.match(/appointment_reminder_(\d+)/)
          const num = match ? parseInt(match[1], 10) : null
          if (num === 1 || num === 2 || num === 3) {
            Appointments.reminderSent({
              appointment_id:                msg.entity_id,
              reminder_number:               num,
              time_before_appointment_hours: null,
              estimated_message_cost:        null,
            })
          }
        }

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
