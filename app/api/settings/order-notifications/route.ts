import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const DEFAULTS = {
  ready_message:                    'Bonjour ! Votre commande #{reference} est prête. Vous pouvez venir la récupérer. Merci !',
  reminder1_enabled:                true,
  reminder1_delay_value:            2,
  reminder1_delay_unit:             'hours',
  reminder1_message:                'Rappel : votre commande #{reference} est toujours disponible.',
  reminder2_enabled:                false,
  reminder2_delay_value:            24,
  reminder2_delay_unit:             'hours',
  reminder2_message:                '',
  reminder3_enabled:                false,
  reminder3_delay_value:            48,
  reminder3_delay_unit:             'hours',
  reminder3_message:                '',
  order_ready_correction_template:  "Bonjour, nous sommes désolés : une erreur s'est produite. Votre commande n'est pas encore prête. Nous vous préviendrons dès qu'elle sera disponible.",
}

// GET /api/settings/order-notifications
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('order_notification_settings')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ data: data ?? { business_id: DEFAULT_BUSINESS_ID, ...DEFAULTS } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/settings/order-notifications
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    const db = createServerClient()
    const { data, error } = await db
      .from('order_notification_settings')
      .upsert({
        business_id:           DEFAULT_BUSINESS_ID,
        ready_message:         body.ready_message         ?? DEFAULTS.ready_message,
        reminder1_enabled:     Boolean(body.reminder1_enabled),
        reminder1_delay_value: Number(body.reminder1_delay_value) || DEFAULTS.reminder1_delay_value,
        reminder1_delay_unit:  body.reminder1_delay_unit  ?? DEFAULTS.reminder1_delay_unit,
        reminder1_message:     body.reminder1_message     ?? '',
        reminder2_enabled:     Boolean(body.reminder2_enabled),
        reminder2_delay_value: Number(body.reminder2_delay_value) || DEFAULTS.reminder2_delay_value,
        reminder2_delay_unit:  body.reminder2_delay_unit  ?? DEFAULTS.reminder2_delay_unit,
        reminder2_message:     body.reminder2_message     ?? '',
        reminder3_enabled:               Boolean(body.reminder3_enabled),
        reminder3_delay_value:           Number(body.reminder3_delay_value) || DEFAULTS.reminder3_delay_value,
        reminder3_delay_unit:            body.reminder3_delay_unit  ?? DEFAULTS.reminder3_delay_unit,
        reminder3_message:               body.reminder3_message     ?? '',
        order_ready_correction_template: body.order_ready_correction_template ?? DEFAULTS.order_ready_correction_template,
        updated_at:                      new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
