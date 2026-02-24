import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getValidGoogleToken, startGoogleWatch } from '@/lib/services/google-calendar-sync'
import { renewMicrosoftSubscription } from '@/lib/services/microsoft-calendar-sync'

// GET /api/jobs/calendar-watch-renew
// Cron: 0 6 * * * — runs daily at 6:00 UTC
// Renews Google Calendar watch channels and Microsoft Graph subscriptions
// that expire within the next 24 hours.
export async function GET() {
  try {
    const db = createServerClient()
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: channels, error } = await db
      .from('calendar_watch_channels')
      .select('business_id, channel_id, provider')
      .lt('expiry_at', threshold)
    if (error) throw error

    if (!channels || channels.length === 0) {
      return NextResponse.json({ data: { renewed: 0 } })
    }

    let renewed = 0
    for (const ch of channels) {
      try {
        if (ch.provider === 'google') {
          const token = await getValidGoogleToken(ch.business_id, db)
          await startGoogleWatch(ch.business_id, db, token)
        } else if (ch.provider === 'microsoft') {
          await renewMicrosoftSubscription(ch.channel_id, ch.business_id, db)
        }
        renewed++
      } catch (e) {
        console.error(`[calendar-watch-renew] Failed to renew ${ch.provider} channel ${ch.channel_id}:`, e)
      }
    }

    return NextResponse.json({ data: { renewed } })
  } catch (err) {
    console.error('[calendar-watch-renew] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
