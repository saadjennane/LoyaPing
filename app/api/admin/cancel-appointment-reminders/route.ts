/**
 * POST /api/admin/cancel-appointment-reminders
 *
 * One-shot endpoint — cancels all SCHEDULED/PROCESSING appointment reminder
 * messages that accumulated during Vonage outage.
 *
 * Secured with CRON_SECRET (same as other admin jobs).
 * Delete this file once used.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  const secret = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()

  const { data, error } = await db
    .from('scheduled_messages')
    .update({
      status:       'CANCELLED',
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .in('status', ['SCHEDULED', 'PROCESSING'])
    .eq('entity_type', 'appointment')
    .like('message_type', 'appointment_reminder_%')
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { cancelled: data?.length ?? 0 } })
}
