import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateRedemptionCode } from '@/lib/services/loyalty'

// POST /api/loyalty/coupons/generate-code  { token, coupon_id }
// Public (client portal) — validates coupon ownership via magic_token
export async function POST(req: NextRequest) {
  try {
    const { token, coupon_id } = await req.json()
    if (!token || !coupon_id) {
      return NextResponse.json({ error: 'token and coupon_id are required' }, { status: 400 })
    }

    const db = createServerClient()

    // Validate token
    const { data: baseClient } = await db
      .from('clients')
      .select('phone_number')
      .eq('magic_token', token)
      .maybeSingle()

    if (!baseClient) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: coupon } = await db
      .from('coupons')
      .select('client_id')
      .eq('id', coupon_id)
      .maybeSingle()

    if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })

    // Check that the coupon's client shares the same phone
    const { data: couponClient } = await db
      .from('clients')
      .select('phone_number')
      .eq('id', coupon.client_id)
      .maybeSingle()

    if (!couponClient || couponClient.phone_number !== baseClient.phone_number) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { code } = await generateRedemptionCode(coupon_id)
    return NextResponse.json({ data: { code } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
