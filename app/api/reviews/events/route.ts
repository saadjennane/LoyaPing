import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAndNotifyUrgentEvent } from '@/lib/services/urgent-notifications'
import { Reviews } from '@/lib/posthog/reviews'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/reviews/events — list timeline events (newest first)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type    = searchParams.get('type')     // filter by event type
    const treated = searchParams.get('treated')  // 'true' | 'false' | null = all
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

    const db = createServerClient()
    let query = db
      .from('reviews_events')
      .select(`
        *,
        client:clients(id, first_name, last_name, civility, phone_number)
      `)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) query = query.eq('type', type)
    if (treated === 'true')  query = query.eq('treated', true)
    if (treated === 'false') query = query.eq('treated', false)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/reviews/events — record a new event
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, type, message_content } = body

    const VALID_TYPES = ['request_sent', 'positive_response', 'negative_response', 'google_intent', 'reminder_sent', 'confirmed']
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('reviews_events')
      .insert({
        business_id:     DEFAULT_BUSINESS_ID,
        client_id:       client_id ?? null,
        type,
        message_content: message_content ?? null,
        treated:         false,
      })
      .select()
      .single()

    if (error) throw error

    // Urgent notification for negative reviews (best-effort)
    if (type === 'negative_response') {
      createAndNotifyUrgentEvent('negative_review', data.id, DEFAULT_BUSINESS_ID).catch((e) => {
        console.error('[reviews] Urgent notification failed:', e)
      })
    }

    // Analytics
    const clientPayload = { client_id: client_id ?? 'unknown' }
    if (type === 'request_sent') {
      Reviews.requestSent({
        client_id:                       client_id ?? 'unknown',
        related_order_or_appointment_id: body.related_id ?? null,
        estimated_message_cost:          null,
      })
    } else if (type === 'positive_response') {
      Reviews.positiveClicked(clientPayload)
    } else if (type === 'negative_response') {
      Reviews.negativeClicked(clientPayload)
    } else if (type === 'google_intent') {
      Reviews.redirectToGoogle(clientPayload)
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
