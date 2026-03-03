/**
 * GET /api/debug/scheduled-messages?entity_id=xxx
 * Temporary debug endpoint — shows scheduled_messages including last_error.
 * Remove after debugging is complete.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const entityId = req.nextUrl.searchParams.get('entity_id')
  if (!entityId) return NextResponse.json({ error: 'entity_id required' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('scheduled_messages')
    .select('id, entity_type, entity_id, message_type, to_whatsapp, body, status, attempts, last_error, send_at, sent_at, created_at')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
