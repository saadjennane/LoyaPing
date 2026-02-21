import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const DEFAULTS = {
  reminder1_enabled:          true,
  reminder1_delay_value:      24,
  reminder1_delay_unit:       'hours',
  reminder1_fixed_send_time:  null,
  reminder1_message:          'Bonjour ! Rappel de votre rendez-vous demain. À bientôt !',
  reminder2_enabled:          false,
  reminder2_delay_value:      2,
  reminder2_delay_unit:       'hours',
  reminder2_fixed_send_time:  null,
  reminder2_message:          '',
  reminder3_enabled:          false,
  reminder3_delay_value:      30,
  reminder3_delay_unit:       'minutes',
  reminder3_fixed_send_time:  null,
  reminder3_message:          '',
  post_messages_enabled:      true,
  post_show_message:          'Merci pour votre visite ! À bientôt.',
  post_no_show_message:       'Vous avez manqué votre rendez-vous. Contactez-nous pour en planifier un nouveau.',
}

// GET /api/settings/appointment-notifications
export async function GET() {
  try {
    const db = createServerClient()
    const { data } = await db
      .from('appointment_notification_settings')
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

// PATCH /api/settings/appointment-notifications
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const db = createServerClient()
    const { data, error } = await db
      .from('appointment_notification_settings')
      .upsert({ business_id: DEFAULT_BUSINESS_ID, ...body, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
