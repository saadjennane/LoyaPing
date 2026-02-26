import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const DEFAULTS = {
  is_active:                     false,
  min_interactions:              3,
  delay_after_interaction_hours: 24,
  satisfaction_message:          'Bonjour {name} ! Étiez-vous satisfait(e) de votre dernière visite ?',
  positive_message:              'Super ! Vous pouvez nous laisser un avis ici 🙏',
  negative_message:              'Merci pour votre retour. Nous allons y remédier rapidement !',
  reminder_enabled:              false,
  reminder_delay_hours:          48,
  google_review_link:            null,
}

// GET /api/settings/reviews
export async function GET() {
  try {
    const db = createServerClient()
    const { data } = await db
      .from('review_settings')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    return NextResponse.json({
      data: data ?? { business_id: DEFAULT_BUSINESS_ID, ...DEFAULTS, updated_at: new Date().toISOString() },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/settings/reviews
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const db = createServerClient()

    const { data, error } = await db
      .from('review_settings')
      .upsert({
        business_id: DEFAULT_BUSINESS_ID,
        ...body,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
