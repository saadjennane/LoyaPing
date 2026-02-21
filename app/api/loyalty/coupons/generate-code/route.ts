import { NextRequest, NextResponse } from 'next/server'
import { generateRedemptionCode } from '@/lib/services/loyalty'

export async function POST(req: NextRequest) {
  try {
    const { coupon_id } = await req.json()
    if (!coupon_id) return NextResponse.json({ error: 'coupon_id is required' }, { status: 400 })

    const { code } = await generateRedemptionCode(coupon_id)
    return NextResponse.json({ data: { code } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
