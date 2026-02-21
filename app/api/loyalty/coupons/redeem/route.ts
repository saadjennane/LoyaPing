import { NextRequest, NextResponse } from 'next/server'
import { redeemCoupon } from '@/lib/services/loyalty'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

    const coupon = await redeemCoupon(code, DEFAULT_BUSINESS_ID)
    return NextResponse.json({ data: coupon })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
