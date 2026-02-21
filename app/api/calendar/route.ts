import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/calendar — return connection status for each provider
export async function GET() {
  try {
    const db = createServerClient()
    const { data } = await db
      .from('calendar_integrations')
      .select('provider, account_email, connected_at')
      .eq('business_id', DEFAULT_BUSINESS_ID)

    const result = {
      google:    (data ?? []).find((r) => r.provider === 'google')    ?? null,
      microsoft: (data ?? []).find((r) => r.provider === 'microsoft') ?? null,
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
