/**
 * DEPRECATED — /api/jobs/order-ready-notifications
 *
 * This endpoint previously processed order_scheduled_notifications rows.
 * It has been superseded by the Outbox pattern:
 *   - Order-ready messages are now written into scheduled_messages via
 *     PATCH /api/orders/:id/ready.
 *   - Sending is handled exclusively by:
 *     GET /api/jobs/dispatch-scheduled-messages
 *
 * This endpoint is kept as a no-op. The cron entry has been removed from
 * vercel.json.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret =
    (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ??
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    deprecated: true,
    message:    'Use /api/jobs/dispatch-scheduled-messages instead.',
    sent:       0,
    failed:     0,
  })
}
