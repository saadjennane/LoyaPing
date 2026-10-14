import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateGiftCardCode, GIFT_CARD_SELECT, toGiftCard } from '@/lib/services/gift-cards'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/gift-cards[?status=active|consumed][&recipient_id=…][&code=CC-XXXXX]
export async function GET(req: NextRequest) {
  try {
    const status      = req.nextUrl.searchParams.get('status')
    const recipientId = req.nextUrl.searchParams.get('recipient_id')
    const code        = req.nextUrl.searchParams.get('code')
    const db = createServerClient()
    let query = db
      .from('gift_cards')
      .select(GIFT_CARD_SELECT)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .order('sold_at', { ascending: false })
    if (status === 'active')   query = query.is('consumed_at', null)
    if (status === 'consumed') query = query.not('consumed_at', 'is', null)
    if (recipientId)           query = query.eq('recipient_client_id', recipientId)
    if (code) {
      // Accept "7K3PQ", "cc-7k3pq" or "CC-7K3PQ"
      const normalized = code.trim().toUpperCase().replace(/^CC-?/, '')
      query = query.eq('code', `CC-${normalized}`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data: (data ?? []).map(toGiftCard) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/gift-cards  { buyer_client_id, recipient_client_id, service_id, amount_paid?, notes? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { buyer_client_id, recipient_client_id, service_id, notes } = body

    if (!buyer_client_id || !recipient_client_id || !service_id) {
      return NextResponse.json({ error: 'Indiquez qui offre, qui reçoit et le soin' }, { status: 400 })
    }

    const db = createServerClient()

    // Both people must be clients of this business
    const { data: people } = await db
      .from('clients')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .in('id', [buyer_client_id, recipient_client_id])
    const found = new Set((people ?? []).map((p) => p.id))
    if (!found.has(buyer_client_id) || !found.has(recipient_client_id)) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 400 })
    }

    const { data: service } = await db
      .from('services')
      .select('id, name, price')
      .eq('id', service_id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .maybeSingle()
    if (!service) return NextResponse.json({ error: 'Soin introuvable' }, { status: 400 })

    const amountPaid = body.amount_paid === undefined || body.amount_paid === '' || body.amount_paid === null
      ? Number(service.price)
      : Number(body.amount_paid)
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      return NextResponse.json({ error: 'Le montant doit être un nombre positif' }, { status: 400 })
    }

    // Retry on the (unlikely) code collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db
        .from('gift_cards')
        .insert({
          business_id:         DEFAULT_BUSINESS_ID,
          code:                generateGiftCardCode(),
          buyer_client_id,
          recipient_client_id,
          service_id:          service.id,
          service_name:        service.name,
          service_price:       service.price,
          amount_paid:         Math.round(amountPaid * 100) / 100,
          notes:               typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        })
        .select(GIFT_CARD_SELECT)
        .single()
      if (!error) return NextResponse.json({ data: toGiftCard(data) }, { status: 201 })
      if (error.code !== '23505') throw error
    }
    throw new Error('Impossible de générer un code unique')
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
