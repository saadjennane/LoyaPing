import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { GIFT_CARD_SELECT, toGiftCard } from '@/lib/services/gift-cards'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/gift-cards/:id  { consumed?: boolean, appointment_id?: string | null, notes?: string }
// consumed=true may link the appointment where the card was used;
// consumed=false clears both the date and the link.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const updates: Record<string, string | null> = {}
    const db = createServerClient()

    if ('consumed' in body) {
      if (!body.consumed) {
        updates.consumed_at = null
        updates.consumed_appointment_id = null
      } else {
        updates.consumed_at = new Date().toISOString()
        updates.consumed_appointment_id = null
        if (body.appointment_id) {
          // Any appointment of the business (not necessarily the recipient's)
          const { data: appt } = await db
            .from('appointments')
            .select('id')
            .eq('id', body.appointment_id)
            .eq('business_id', DEFAULT_BUSINESS_ID)
            .is('deleted_at', null)
            .maybeSingle()
          if (!appt) return NextResponse.json({ error: 'RDV introuvable' }, { status: 400 })
          updates.consumed_appointment_id = appt.id
        }
      }
    }
    // Reserve for an appointment (or release) without consuming the card
    if (!('consumed' in body) && 'appointment_id' in body) {
      if (body.appointment_id) {
        const { data: appt } = await db
          .from('appointments')
          .select('id')
          .eq('id', body.appointment_id)
          .eq('business_id', DEFAULT_BUSINESS_ID)
          .is('deleted_at', null)
          .maybeSingle()
        if (!appt) return NextResponse.json({ error: 'RDV introuvable' }, { status: 400 })
        updates.consumed_appointment_id = appt.id
      } else {
        updates.consumed_appointment_id = null
      }
    }
    if ('notes' in body) updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
    }

    const { data, error } = await db
      .from('gift_cards')
      .update(updates)
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .select(GIFT_CARD_SELECT)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Carte cadeau introuvable' }, { status: 404 })
    return NextResponse.json({ data: toGiftCard(data) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/gift-cards/:id — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db
      .from('gift_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
