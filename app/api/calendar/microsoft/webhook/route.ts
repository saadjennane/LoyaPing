import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { syncMicrosoftCalendar } from '@/lib/services/microsoft-calendar-sync'

// POST /api/calendar/microsoft/webhook — receives Microsoft Graph change notifications
//
// Two modes:
//  1. Validation challenge (on subscription creation):
//     Microsoft sends ?validationToken=... → must echo back as plain text within 10s
//  2. Change notification:
//     Microsoft sends { value: [...notifications] } — each notification has subscriptionId + changeType
export async function POST(req: NextRequest) {
  // Validation challenge
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  try {
    const body = await req.json()
    const notifications: Array<{ subscriptionId?: string; changeType?: string }> = body.value ?? []

    if (notifications.length > 0) {
      const subscriptionId = notifications[0]?.subscriptionId
      if (subscriptionId) {
        const db = createServerClient()
        const { data: channel } = await db
          .from('calendar_watch_channels')
          .select('business_id')
          .eq('channel_id', subscriptionId)
          .maybeSingle()

        if (channel) {
          // Fire async — return 200 immediately so Microsoft doesn't retry
          syncMicrosoftCalendar(channel.business_id).catch((e) => {
            console.error('[calendar/microsoft/webhook] sync error:', e)
          })
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[calendar/microsoft/webhook] error:', err)
    // Always return 200 to prevent Microsoft retry storms
    return NextResponse.json({ status: 'ok' })
  }
}
