import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  const db = createServerClient()

  const [orderNotifRes, apptNotifRes, tiersRes] = await Promise.all([
    db
      .from('order_notification_settings')
      .select('ready_message')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle(),
    db
      .from('appointment_notification_settings')
      .select('reminder1_enabled')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle(),
    db
      .from('loyalty_tiers')
      .select('id')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('is_enabled', true)
      .limit(1),
  ])

  const orders_configured       = !!(orderNotifRes.data?.ready_message?.trim())
  const appointments_configured = !!(apptNotifRes.data?.reminder1_enabled)
  const loyalty_configured      = (tiersRes.data?.length ?? 0) > 0

  return NextResponse.json({ data: { orders_configured, appointments_configured, loyalty_configured } })
}
