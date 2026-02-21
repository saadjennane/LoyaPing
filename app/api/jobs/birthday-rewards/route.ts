import { NextRequest, NextResponse } from 'next/server'
import { processBirthdayRewards } from '@/lib/services/birthday-rewards'

// GET /api/jobs/birthday-rewards?secret=CRON_SECRET
// Cron worker: runs daily, finds clients with today's birthday,
// creates a birthday coupon and sends a WhatsApp message (if configured).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processBirthdayRewards()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[birthday-rewards] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
