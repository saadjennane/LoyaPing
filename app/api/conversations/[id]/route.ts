import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// GET /api/conversations/:id
// Returns conversation + all messages (ordered ASC).
// Side effect: TO_TREAT → OPEN (merchant opened the conversation).
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()

    const { data: conv, error } = await db
      .from('conversations')
      .select('*, client:clients(first_name, last_name, civility, phone_number)')
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .single()

    if (error) throw error
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // TO_TREAT → OPEN when merchant opens the conversation
    if (conv.status === 'TO_TREAT') {
      await db.from('conversations')
        .update({ status: 'OPEN' })
        .eq('id', id)
      conv.status = 'OPEN'
    }

    // Fetch messages
    const { data: messages } = await db
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ data: { ...conv, messages: messages ?? [] } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/conversations/:id
// Body: { status: 'IN_PROGRESS' | 'RESOLVED' }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { status } = await req.json()

    const ALLOWED = ['IN_PROGRESS', 'RESOLVED']
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${ALLOWED.join(', ')}` }, { status: 400 })
    }

    const db = createServerClient()
    const { error } = await db
      .from('conversations')
      .update({ status })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)

    if (error) throw error
    return NextResponse.json({ data: { id, status } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
