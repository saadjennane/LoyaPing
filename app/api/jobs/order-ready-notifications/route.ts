import { NextRequest, NextResponse } from 'next/server'
import { processScheduledReadyNotifications } from '@/lib/services/orders'

// GET /api/jobs/order-ready-notifications?secret=CRON_SECRET
// Cron worker: picks up all SCHEDULED READY notifications past their scheduled_for
// and sends the WhatsApp messages (or cancels if order is no longer READY).
// Run every minute via vercel.json cron.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processScheduledReadyNotifications()
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
