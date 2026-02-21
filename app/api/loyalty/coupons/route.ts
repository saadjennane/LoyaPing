import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/loyalty/coupons — all coupons for the business (with tier + client)
export async function GET() {
  try {
    const db = createServerClient()

    // Get tier IDs for this business
    const { data: tiers, error: tiersErr } = await db
      .from('loyalty_tiers')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)

    if (tiersErr) throw tiersErr

    const tierIds = (tiers ?? []).map((t) => t.id)

    if (tierIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const { data, error } = await db
      .from('coupons')
      .select('*, tier:loyalty_tiers(*), client:clients(id, civility, first_name, last_name, phone_number, email)')
      .in('tier_id', tierIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
