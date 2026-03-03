import { NextRequest, NextResponse } from 'next/server'
import { redeemCoupon } from '@/lib/services/loyalty'
import { Loyalty } from '@/lib/posthog/loyalty'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

    const coupon = await redeemCoupon(code, DEFAULT_BUSINESS_ID)

    const c = coupon as unknown as Record<string, unknown>
    const unlockedAt  = c.unlocked_at  as string | null
    const redeemedAt  = c.redeemed_at  as string | null ?? new Date().toISOString()
    const daysSinceUnlock = unlockedAt
      ? Math.round((new Date(redeemedAt).getTime() - new Date(unlockedAt).getTime()) / 86_400_000)
      : null
    Loyalty.rewardRedeemed({
      reward_id:        (c.id ?? c.reward_id ?? code) as string,
      days_since_unlock: daysSinceUnlock,
    })

    return NextResponse.json({ data: coupon })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
