import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const DEFAULTS = {
  urgent_notify_reschedule:      false,
  urgent_notify_negative_review: false,
  urgent_whatsapp_number_1:      null as string | null,
  urgent_whatsapp_number_2:      null as string | null,
}

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('business_profile')
      .select('urgent_notify_reschedule, urgent_notify_negative_review, urgent_whatsapp_number_1, urgent_whatsapp_number_2')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ data: data ?? DEFAULTS })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      urgent_notify_reschedule,
      urgent_notify_negative_review,
      urgent_whatsapp_number_1,
      urgent_whatsapp_number_2,
    } = body

    const db = createServerClient()
    const { error } = await db
      .from('business_profile')
      .update({
        urgent_notify_reschedule:      !!urgent_notify_reschedule,
        urgent_notify_negative_review: !!urgent_notify_negative_review,
        urgent_whatsapp_number_1:      urgent_whatsapp_number_1 || null,
        urgent_whatsapp_number_2:      urgent_whatsapp_number_2 || null,
        updated_at:                    new Date().toISOString(),
      })
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
