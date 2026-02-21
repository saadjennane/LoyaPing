import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/calendar/google/callback — exchange code for tokens
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  const settingsUrl = `${process.env.APP_URL}/settings?tab=calendrier`

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}&error=google_auth_failed`)
  }

  try {
    const clientId     = process.env.GOOGLE_CALENDAR_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!
    const redirectUri  = `${process.env.APP_URL}/api/calendar/google/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('[calendar/google] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${settingsUrl}&error=google_token_failed`)
    }

    const tokens = await tokenRes.json()

    // Fetch user email
    let accountEmail: string | null = null
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userRes.ok) {
        const user = await userRes.json()
        accountEmail = user.email ?? null
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
        provider:      'google',
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expiry:  tokenExpiry,
        account_email: accountEmail,
        connected_at:  new Date().toISOString(),
      })

    if (dbError) {
      console.error('[calendar/google] DB upsert error:', dbError)
      return NextResponse.redirect(`${settingsUrl}&error=google_db_failed`)
    }

    return NextResponse.redirect(`${settingsUrl}&success=google`)
  } catch (err) {
    console.error('[calendar/google] Unexpected error:', err)
    return NextResponse.redirect(`${settingsUrl}&error=google_unexpected`)
  }
}
