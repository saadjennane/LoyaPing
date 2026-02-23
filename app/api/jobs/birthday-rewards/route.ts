/**
 * GET /api/jobs/birthday-rewards
 *
 * Cron worker — runs daily at 00:00 UTC via Vercel Cron.
 * Finds clients whose birthday matches today (in the business timezone),
 * creates a birthday coupon, and queues a WhatsApp message via the outbox.
 *
 * Auth: CRON_SECRET environment variable is REQUIRED.
 *   - Missing → 500 (mis-configuration, do not run the job)
 *   - Present but wrong → 401
 * Vercel Cron sends: Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server'
import { processBirthdayRewards } from '@/lib/services/birthday-rewards'

export async function GET(req: NextRequest) {
  // ── Auth — CRON_SECRET is mandatory ───────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[birthday-rewards] CRON_SECRET is not configured')
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

  // ── Run ───────────────────────────────────────────────────────────────────
  try {
    const result = await processBirthdayRewards()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[birthday-rewards] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
