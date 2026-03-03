/**
 * PARTIALLY DEPRECATED — /api/jobs/reminders
 *
 * processDueReminders() has been REMOVED from this handler.
 *
 * Root cause of the removal:
 *   - It read from the legacy reminder_configs table (deprecated since migration 024).
 *   - Migration 032 added write-blocking triggers on reminder_sends.
 *   - This caused deduplication to fail silently: sendWhatsAppMessage() fired,
 *     the reminder_sends INSERT raised an exception, the catch swallowed the error,
 *     and the next cron run re-sent the same message — every minute, indefinitely.
 *
 * Appointment reminders are now handled exclusively by the outbox pattern:
 *   - Scheduled into scheduled_messages at appointment creation / reschedule.
 *   - Dispatched by GET /api/jobs/dispatch-scheduled-messages (runs every minute).
 *
 * expireStaleRedemptionCodes() is retained here to avoid adding a new cron entry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { expireStaleRedemptionCodes } from '@/lib/services/loyalty'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret =
    (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ??
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await expireStaleRedemptionCodes()

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reminders] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
