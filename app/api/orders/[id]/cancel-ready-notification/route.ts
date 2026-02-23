/**
 * DEPRECATED — POST /api/orders/:id/cancel-ready-notification
 *
 * Previously cancelled a legacy order_scheduled_notifications row.
 * The UI now calls POST /api/scheduled-messages/:id/cancel instead.
 *
 * Kept as a no-op to avoid 404s from any lingering clients.
 */

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    deprecated: true,
    message:    'Use /api/scheduled-messages/:id/cancel instead.',
    success:    false,
  })
}
