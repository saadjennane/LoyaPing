/**
 * DEPRECATED — /api/jobs/appointment-reminders
 *
 * This endpoint previously scanned the appointment_notifications table and
 * sent WhatsApp reminders directly.
 *
 * It has been superseded by the Outbox pattern:
 *   - Reminders are now written into scheduled_messages at appointment
 *     creation / reschedule time (scheduleAppointmentReminders).
 *   - Sending is handled exclusively by:
 *     GET /api/jobs/dispatch-scheduled-messages
 *
 * This endpoint is kept as a no-op so the existing Vercel Cron entry does
 * not produce 404 errors while the cron config is being updated.
 *
 * TODO: Remove this entry from vercel.json once confirmed stable:
 *   { "path": "/api/jobs/appointment-reminders", "schedule": "* * * * *" }
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
