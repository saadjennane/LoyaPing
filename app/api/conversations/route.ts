import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/conversations?status=TO_TREAT
// Returns conversations with client join + last message preview
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status') ?? 'TO_TREAT'
    const db = createServerClient()

    const { data, error } = await db
      .from('conversations')
      .select(`
        *,
        client:clients(first_name, last_name, civility, phone_number)
      `)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch last message for each conversation
    const ids = (data ?? []).map((c) => c.id as string)
    let lastMessages: Record<string, string> = {}

    if (ids.length > 0) {
      const { data: msgs } = await db
        .from('conversation_messages')
        .select('conversation_id, body, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })

      // Keep only the latest message per conversation
      for (const msg of msgs ?? []) {
        const cid = msg.conversation_id as string
        if (!lastMessages[cid]) lastMessages[cid] = msg.body as string
      }
    }

    const enriched = (data ?? []).map((c) => ({
      ...c,
      last_message: lastMessages[c.id as string] ?? null,
    }))

    return NextResponse.json({ data: enriched })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/conversations — create or return existing active conversation
// Body: { client_id?, phone, entity_type?, entity_id?, initial_message? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, phone, entity_type, entity_id, initial_message } = body

    if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 })

    const db = createServerClient()

    // Check for existing active (non-RESOLVED) conversation
    const { data: existing } = await db
      .from('conversations')
      .select('id, status')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('phone', phone)
      .neq('status', 'RESOLVED')
      .maybeSingle()

    if (existing) {
      // Log the initial message if provided
      if (initial_message) {
        await db.from('conversation_messages').insert({
          conversation_id: existing.id,
          direction: 'inbound',
          body: initial_message,
        })
        await db.from('conversations')
          .update({ last_inbound_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      return NextResponse.json({ data: existing })
    }

    // Create new conversation
    const { data: created, error } = await db
      .from('conversations')
      .insert({
        business_id: DEFAULT_BUSINESS_ID,
        client_id:   client_id ?? null,
        phone,
        entity_type: entity_type ?? null,
        entity_id:   entity_id   ?? null,
        status:      'TO_TREAT',
        last_inbound_at: new Date().toISOString(),
      })
      .select('id, status')
      .single()

    if (error) throw error

    // Log initial message
    if (initial_message && created) {
      await db.from('conversation_messages').insert({
        conversation_id: created.id,
        direction: 'inbound',
        body: initial_message,
      })
    }

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
