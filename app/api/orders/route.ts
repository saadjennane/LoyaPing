import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getActiveOrders, markOrderCompletedImmediately } from '@/lib/services/orders'
import { capture } from '@/lib/posthog/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/orders — list active orders
export async function GET() {
  try {
    const orders = await getActiveOrders(DEFAULT_BUSINESS_ID)
    return NextResponse.json({ data: orders })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/orders — create order
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, reference: rawReference, amount, completed_immediately } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    const db = createServerClient()

    // Auto-generate reference if not provided
    let reference: string | null = rawReference?.trim() || null
    if (!reference) {
      const { data: profileData } = await db
        .from('business_profile')
        .select('order_number_prefix, order_number_next')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle()

      const prefix = profileData?.order_number_prefix ?? ''
      const next   = profileData?.order_number_next   ?? 1
      const padded = String(next).padStart(3, '0')

      reference = prefix ? `${prefix}-${padded}` : padded

      // Increment the counter (best-effort — no strict atomicity needed for a single business)
      await db
        .from('business_profile')
        .update({ order_number_next: next + 1 })
        .eq('business_id', DEFAULT_BUSINESS_ID)
    }

    const orderAmount = amount ?? 0
    const now = new Date().toISOString()

    const { data, error } = await db
      .from('orders')
      .insert({
        client_id,
        business_id: DEFAULT_BUSINESS_ID,
        reference,
        amount: orderAmount,
        status: completed_immediately ? 'completed' : 'pending',
        completed_at: completed_immediately ? now : null,
      })
      .select()
      .single()

    if (error) throw error

    // Credit points immediately if completed on the spot
    if (completed_immediately && data) {
      await markOrderCompletedImmediately(data.id, DEFAULT_BUSINESS_ID, client_id, orderAmount)
    }

    capture('order_created', { completed_immediately: !!completed_immediately })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
