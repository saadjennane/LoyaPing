import { NextResponse } from 'next/server'

// GET /api/calendar/google/connect — redirect to Google OAuth consent screen
export async function GET() {
  const clientId     = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const redirectUri  = `${process.env.APP_URL}/api/calendar/google/callback`

  if (!clientId || !process.env.APP_URL) {
    return NextResponse.json(
      { error: 'GOOGLE_CALENDAR_CLIENT_ID and APP_URL must be set' },
      { status: 500 }
    )
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    access_type:   'offline',
    prompt:        'consent',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
