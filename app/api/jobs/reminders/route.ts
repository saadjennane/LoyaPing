import { NextRequest, NextResponse } from 'next/server'
import { processDueReminders } from '@/lib/services/reminders'
import { expireStaleRedemptionCodes } from '@/lib/services/loyalty'

// Called by cron (Vercel Cron, GitHub Actions, etc.) every minute
// Protect with a shared secret
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [remindersResult] = await Promise.all([
      processDueReminders(),
      expireStaleRedemptionCodes(),
    ])

    return NextResponse.json({
      ok: true,
      reminders: remindersResult,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
