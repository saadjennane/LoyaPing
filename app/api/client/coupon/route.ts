import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// GET /api/client/coupon?token=...&coupon_id=...
// Returns coupon info for the redeem page — validates ownership via magic_token
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token    = searchParams.get('token')
  const couponId = searchParams.get('coupon_id')

  if (!token || !couponId) {
    return NextResponse.json({ error: 'token and coupon_id are required' }, { status: 400 })
  }

  const db = createServerClient()

  // Validate token
  const { data: baseClient } = await db
    .from('clients')
    .select('id, phone_number')
    .eq('magic_token', token)
    .maybeSingle()

  if (!baseClient) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // Fetch coupon + verify ownership (client must share phone_number)
  const { data: coupon } = await db
    .from('coupons')
    .select('*, tier:loyalty_tiers(*)')
    .eq('id', couponId)
    .eq('status', 'active')
    .maybeSingle()

  if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })

  // Check that the coupon's client shares the same phone
  const { data: couponClient } = await db
    .from('clients')
    .select('id, phone_number, business_id')
    .eq('id', coupon.client_id)
    .maybeSingle()

  if (!couponClient || couponClient.phone_number !== baseClient.phone_number) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Get business name + branding
  const { data: profile } = await db
    .from('business_profile')
    .select('name, primary_color')
    .eq('business_id', couponClient.business_id)
    .maybeSingle()

  return NextResponse.json({
    data: {
      id:                 coupon.id,
      reward_title:       coupon.tier?.reward_title ?? null,
      reward_description: coupon.tier?.reward_description ?? 'Récompense',
      expires_at:         coupon.expires_at,
      business_name:      profile?.name ?? '',
      primary_color:      profile?.primary_color ?? '#6366f1',
      token,
      business_id:        couponClient.business_id,
    },
  })
}
