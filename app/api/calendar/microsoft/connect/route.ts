import { NextResponse } from 'next/server'

// GET /api/calendar/microsoft/connect — redirect to Microsoft OAuth consent screen
export async function GET() {
  const clientId    = process.env.MICROSOFT_CALENDAR_CLIENT_ID
  const tenantId    = process.env.MICROSOFT_CALENDAR_TENANT_ID ?? 'common'
  const redirectUri = `${process.env.APP_URL}/api/calendar/microsoft/callback`

  if (!clientId || !process.env.APP_URL) {
    return NextResponse.json(
      { error: 'MICROSOFT_CALENDAR_CLIENT_ID and APP_URL must be set' },
      { status: 500 }
    )
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'offline_access Calendars.ReadWrite User.Read',
    response_mode: 'query',
  })

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
  )
}
