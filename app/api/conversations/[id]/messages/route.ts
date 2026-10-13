import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// POST /api/conversations/:id/messages
// Sends a WhatsApp message to the client and logs it as outbound.
// Side effect: OPEN → IN_PROGRESS (first merchant reply).
// Body: { body: string }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { body: messageBody } = await req.json()

    if (!messageBody?.trim()) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 })
    }

    const db = createServerClient()

    // Fetch conversation
    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('id, phone, status, business_id')
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .single()

    if (convErr || !conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (conv.status === 'RESOLVED') {
      return NextResponse.json({ error: 'Cannot send message to a resolved conversation' }, { status: 409 })
    }

    // Send WhatsApp message
    await sendWhatsAppMessage({ to: conv.phone as string, text: messageBody.trim() })

    // Log outbound message
    const { data: msg, error: msgErr } = await db
      .from('conversation_messages')
      .insert({
        conversation_id: id,
        direction: 'outbound',
        body: messageBody.trim(),
      })
      .select()
      .single()

    if (msgErr) throw msgErr

    // OPEN → IN_PROGRESS on first merchant reply
    if (conv.status === 'OPEN') {
      await db.from('conversations')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', id)
    }

    return NextResponse.json({ data: msg }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
