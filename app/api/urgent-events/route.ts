import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/urgent-events
// ?count=true → returns { data: { pending: number } }
// otherwise  → returns { data: UrgentEvent[] } (pending only, newest first)
export async function GET(req: NextRequest) {
  try {
    const db  = createServerClient()
    const countOnly = req.nextUrl.searchParams.get('count') === 'true'

    if (countOnly) {
      const { count, error } = await db
        .from('urgent_events')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .eq('status', 'pending')
      if (error) throw error
      return NextResponse.json({ data: { pending: count ?? 0 } })
    }

    const { data, error } = await db
      .from('urgent_events')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
