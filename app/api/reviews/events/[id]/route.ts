import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// PATCH /api/reviews/events/[id] — mark as treated (or untreated)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params
    const body = await req.json()
    const treated = body.treated !== undefined ? Boolean(body.treated) : true

    const db = createServerClient()
    const { data, error } = await db
      .from('reviews_events')
      .update({ treated })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
