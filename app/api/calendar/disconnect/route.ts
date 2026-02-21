import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// DELETE /api/calendar/disconnect?provider=google|microsoft
export async function DELETE(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider')

  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider. Use "google" or "microsoft"' }, { status: 400 })
  }

  try {
    const db = createServerClient()
    const { error } = await db
      .from('calendar_integrations')
      .delete()
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('provider', provider)

    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
