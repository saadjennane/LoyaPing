import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { startMicrosoftSubscription } from '@/lib/services/microsoft-calendar-sync'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/calendar/microsoft/callback — exchange code for tokens
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  const settingsUrl = `${process.env.APP_URL}/settings?tab=calendrier`

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}&error=microsoft_auth_failed`)
  }

  try {
    const clientId     = process.env.MICROSOFT_CALENDAR_CLIENT_ID!
    const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET!
    const tenantId     = process.env.MICROSOFT_CALENDAR_TENANT_ID ?? 'common'
    const redirectUri  = `${process.env.APP_URL}/api/calendar/microsoft/callback`

    // Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
          scope:         'offline_access Calendars.ReadWrite User.Read',
        }),
      }
    )

    if (!tokenRes.ok) {
      console.error('[calendar/microsoft] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${settingsUrl}&error=microsoft_token_failed`)
    }

    const tokens = await tokenRes.json()

    // Fetch user email
    let accountEmail: string | null = null
    try {
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userRes.ok) {
        const user = await userRes.json()
        accountEmail = user.mail ?? user.userPrincipalName ?? null
      }
    } catch {}

    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null

    // Upsert integration
    const db = createServerClient()
    const { error: dbError } = await db
      .from('calendar_integrations')
      .upsert({
        business_id:   DEFAULT_BUSINESS_ID,
        provider:      'microsoft',
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expiry:  tokenExpiry,
        account_email: accountEmail,
        connected_at:  new Date().toISOString(),
      })

    if (dbError) {
      console.error('[calendar/microsoft] DB upsert error:', dbError)
      return NextResponse.redirect(`${settingsUrl}&error=microsoft_db_failed`)
    }

    // Start Microsoft Graph change notification subscription (best-effort)
    startMicrosoftSubscription(DEFAULT_BUSINESS_ID, db, tokens.access_token).catch((e) => {
      console.error('[calendar/microsoft] Failed to start subscription:', e)
    })

    return NextResponse.redirect(`${settingsUrl}&success=microsoft`)
  } catch (err) {
    console.error('[calendar/microsoft] Unexpected error:', err)
    return NextResponse.redirect(`${settingsUrl}&error=microsoft_unexpected`)
  }
}
