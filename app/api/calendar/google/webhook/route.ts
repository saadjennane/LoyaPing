import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { syncGoogleCalendar } from '@/lib/services/google-calendar-sync'

// POST /api/calendar/google/webhook — receives Google Calendar push notifications
// Google sends this header on every event change:
//   X-Goog-Channel-Id     : channel UUID we registered
//   X-Goog-Resource-State : 'sync' (initial handshake) | 'exists' (change) | 'not_exists' (deleted)
export async function POST(req: NextRequest) {
  try {
    const channelId     = req.headers.get('x-goog-channel-id')
    const resourceState = req.headers.get('x-goog-resource-state')

    // Initial handshake — just acknowledge, no sync needed
    if (!channelId || resourceState === 'sync') {
      return NextResponse.json({ status: 'ok' })
    }

    // Look up the business that owns this channel
    const db = createServerClient()
    const { data: channel } = await db
      .from('calendar_watch_channels')
      .select('business_id')
      .eq('channel_id', channelId)
      .maybeSingle()

    if (!channel) {
      // Unknown channel — ignore silently
      return NextResponse.json({ status: 'ok' })
    }

    if (resourceState === 'exists') {
      // Fire sync asynchronously — return 200 immediately so Google doesn't retry
      syncGoogleCalendar(channel.business_id).catch((e) => {
        console.error('[calendar/google/webhook] sync error:', e)
      })
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[calendar/google/webhook] error:', err)
    // Always return 200 to prevent Google retry storms
    return NextResponse.json({ status: 'ok' })
  }
}
