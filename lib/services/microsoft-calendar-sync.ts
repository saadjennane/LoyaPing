import { createServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'
const GRAPH_API = 'https://graph.microsoft.com/v1.0'

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid Microsoft access token, refreshing if expired (within 5 min).
 */
export async function getValidMicrosoftToken(
  businessId: string,
  db: SupabaseClient,
): Promise<string> {
  const { data, error } = await db
    .from('calendar_integrations')
    .select('access_token, refresh_token, token_expiry')
    .eq('business_id', businessId)
    .eq('provider', 'microsoft')
    .maybeSingle()

  if (error) throw new Error(`[ms-calendar] DB read error: ${error.message}`)
  if (!data) throw new Error('[ms-calendar] No Microsoft integration found')

  const expiresAt = data.token_expiry ? new Date(data.token_expiry).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  if (!needsRefresh) return data.access_token

  if (!data.refresh_token) throw new Error('[ms-calendar] No refresh token available')

  const tenantId = process.env.MICROSOFT_CALENDAR_TENANT_ID ?? 'common'
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CALENDAR_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET!,
        refresh_token: data.refresh_token,
        grant_type:    'refresh_token',
        scope:         'offline_access Calendars.ReadWrite',
      }),
    },
  )

  if (!tokenRes.ok) {
    throw new Error(`[ms-calendar] Token refresh failed: ${await tokenRes.text()}`)
  }

  const tokens = await tokenRes.json()
  const newExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  await db
    .from('calendar_integrations')
    .update({ access_token: tokens.access_token, token_expiry: newExpiry })
    .eq('business_id', businessId)
    .eq('provider', 'microsoft')

  return tokens.access_token
}

// ── Event processing ──────────────────────────────────────────────────────────

type MicrosoftEvent = {
  id: string
  '@removed'?: { reason: string }
  subject?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  attendees?: Array<{ emailAddress: { address: string } }>
}

async function processMicrosoftEvent(
  event: MicrosoftEvent,
  businessId: string,
  db: SupabaseClient,
): Promise<void> {
  // Deleted event (delta query returns @removed for deleted items)
  if (event['@removed']) {
    await db
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('microsoft_event_id', event.id)
      .is('deleted_at', null)

    await db
      .from('calendar_imports')
      .delete()
      .eq('business_id', businessId)
      .eq('event_id', event.id)

    return
  }

  const startIso = event.start?.dateTime
  if (!startIso) return // all-day events without dateTime — skip

  const endIso = event.end?.dateTime ?? null
  const attendeeEmails = (event.attendees ?? [])
    .map((a) => a.emailAddress?.address)
    .filter(Boolean) as string[]

  let clientId: string | null = null
  if (attendeeEmails.length > 0) {
    const { data: clientRow } = await db
      .from('clients')
      .select('id')
      .eq('business_id', businessId)
      .in('email', attendeeEmails)
      .maybeSingle()
    clientId = clientRow?.id ?? null
  }

  if (clientId) {
    const { error } = await db.from('appointments').upsert(
      {
        client_id:          clientId,
        business_id:        businessId,
        scheduled_at:       startIso,
        ended_at:           endIso,
        notes:              event.subject ?? null,
        status:             'scheduled',
        microsoft_event_id: event.id,
      },
      { onConflict: 'microsoft_event_id', ignoreDuplicates: false },
    )
    if (error) console.error('[ms-calendar] upsert appointment error:', error.message)
  } else {
    const { error } = await db.from('calendar_imports').upsert(
      {
        business_id: businessId,
        provider:    'microsoft',
        event_id:    event.id,
        summary:     event.subject ?? null,
        start_at:    startIso,
        end_at:      endIso,
        attendees:   attendeeEmails.length > 0 ? attendeeEmails : null,
        raw:         event as object,
      },
      { onConflict: 'business_id,event_id', ignoreDuplicates: false },
    )
    if (error) console.error('[ms-calendar] upsert calendar_import error:', error.message)
  }
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Pulls new/changed events from Microsoft Calendar via delta query.
 * Uses stored deltaLink for incremental sync; falls back to full sync on 410.
 * Reads calendar_id from calendar_watch_channels (defaults to 'primary').
 * 'primary' → uses me/calendarView/delta; otherwise uses me/calendars/{id}/events/delta.
 */
export async function syncMicrosoftCalendar(businessId = DEFAULT_BUSINESS_ID): Promise<void> {
  const db    = createServerClient()
  const token = await getValidMicrosoftToken(businessId, db)

  const { data: channel } = await db
    .from('calendar_watch_channels')
    .select('sync_token, calendar_id')
    .eq('business_id', businessId)
    .eq('provider', 'microsoft')
    .maybeSingle()

  const deltaLink  = channel?.sync_token ?? null
  const calendarId = channel?.calendar_id ?? 'primary'

  const fetchDelta = async (url?: string): Promise<{ events: MicrosoftEvent[]; nextDeltaLink: string | null }> => {
    const now    = new Date().toISOString()
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()

    let baseUrl: string
    if (calendarId === 'primary') {
      baseUrl = `${GRAPH_API}/me/calendarView/delta?startDateTime=${now}&endDateTime=${future}&$top=250`
    } else {
      baseUrl = `${GRAPH_API}/me/calendars/${calendarId}/events/delta?$top=250`
    }

    const fetchUrl = url ?? baseUrl

    const res = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // 410 Gone = deltaLink expired → full resync
    if (res.status === 410 && url) {
      return fetchDelta()
    }

    if (!res.ok) {
      throw new Error(`[ms-calendar] Graph delta error ${res.status}: ${await res.text()}`)
    }

    const json = await res.json()
    const events: MicrosoftEvent[] = json.value ?? []

    // Handle pagination
    if (json['@odata.nextLink']) {
      const next = await fetchDelta(json['@odata.nextLink'])
      return { events: [...events, ...next.events], nextDeltaLink: next.nextDeltaLink }
    }

    return { events, nextDeltaLink: json['@odata.deltaLink'] ?? null }
  }

  const { events, nextDeltaLink } = await fetchDelta(deltaLink ?? undefined)

  for (const event of events) {
    await processMicrosoftEvent(event, businessId, db)
  }

  if (nextDeltaLink) {
    await db
      .from('calendar_watch_channels')
      .update({ sync_token: nextDeltaLink })
      .eq('business_id', businessId)
      .eq('provider', 'microsoft')
  }
}

// ── Subscription management ───────────────────────────────────────────────────

/**
 * Registers a Microsoft Graph change notification subscription for calendar events.
 * Subscriptions expire after 3 days — renewed daily by the cron job.
 * @param calendarId — Microsoft calendar ID ('primary' uses the default calendar resource)
 */
export async function startMicrosoftSubscription(
  businessId: string,
  db: SupabaseClient,
  accessToken: string,
  calendarId = 'primary',
): Promise<void> {
  const webhookUrl = `${process.env.APP_URL}/api/calendar/microsoft/webhook`
  // Max expiry for calendar subscriptions is 4320 minutes (3 days)
  const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  // 'primary' uses the default calendar resource; otherwise use specific calendar
  const resource = calendarId === 'primary'
    ? 'me/calendar/events'
    : `me/calendars/${calendarId}/events`

  const res = await fetch(`${GRAPH_API}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType:         'created,updated,deleted',
      notificationUrl:    webhookUrl,
      resource,
      expirationDateTime: expiry,
    }),
  })

  if (!res.ok) {
    throw new Error(`[ms-calendar] Subscription creation failed: ${await res.text()}`)
  }

  const sub = await res.json()

  await db.from('calendar_watch_channels').upsert(
    {
      business_id: businessId,
      provider:    'microsoft',
      channel_id:  sub.id,
      resource_id: null,
      expiry_at:   sub.expirationDateTime ?? expiry,
      calendar_id: calendarId,
    },
    { onConflict: 'business_id,provider' },
  )

  // Initial sync: pull upcoming events
  await syncMicrosoftCalendar(businessId)
}

/**
 * Renews an existing Microsoft Graph subscription by PATCHing its expiry.
 */
export async function renewMicrosoftSubscription(
  subscriptionId: string,
  businessId: string,
  db: SupabaseClient,
): Promise<void> {
  const token  = await getValidMicrosoftToken(businessId, db)
  const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${GRAPH_API}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expirationDateTime: expiry }),
  })

  if (!res.ok) {
    throw new Error(`[ms-calendar] Subscription renewal failed: ${await res.text()}`)
  }

  await db
    .from('calendar_watch_channels')
    .update({ expiry_at: expiry })
    .eq('business_id', businessId)
    .eq('provider', 'microsoft')
}

// ── LoyaPing → Microsoft Calendar ────────────────────────────────────────────

/**
 * Creates or updates a Microsoft Calendar event from a LoyaPing appointment.
 * Reads calendar_id from calendar_watch_channels (defaults to 'primary').
 */
export async function pushAppointmentToMicrosoft(
  appointmentId: string,
  businessId: string,
): Promise<void> {
  const db    = createServerClient()
  const token = await getValidMicrosoftToken(businessId, db)

  const { data: appt } = await db
    .from('appointments')
    .select('id, client_id, scheduled_at, ended_at, notes, microsoft_event_id')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) return

  let clientEmail: string | null = null
  if (appt.client_id) {
    const { data: client } = await db
      .from('clients')
      .select('email')
      .eq('id', appt.client_id)
      .maybeSingle()
    clientEmail = client?.email ?? null
  }

  // Read selected calendar
  const { data: ch } = await db
    .from('calendar_watch_channels')
    .select('calendar_id')
    .eq('business_id', businessId)
    .eq('provider', 'microsoft')
    .maybeSingle()
  const calId = ch?.calendar_id ?? 'primary'

  const startMs = new Date(appt.scheduled_at).getTime()
  const endIso  = appt.ended_at ?? new Date(startMs + 60 * 60 * 1000).toISOString()

  const eventBody = {
    subject:   appt.notes ?? 'Rendez-vous',
    start:     { dateTime: appt.scheduled_at, timeZone: 'UTC' },
    end:       { dateTime: endIso,            timeZone: 'UTC' },
    attendees: clientEmail
      ? [{ emailAddress: { address: clientEmail }, type: 'required' }]
      : [],
  }

  if (appt.microsoft_event_id) {
    // Update existing event (event ID is sufficient, no calendarId needed)
    const res = await fetch(
      `${GRAPH_API}/me/events/${appt.microsoft_event_id}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventBody),
      },
    )
    if (!res.ok) {
      throw new Error(`[ms-calendar] Event update failed: ${await res.text()}`)
    }
  } else {
    // Create new event in the selected calendar
    const createUrl = calId === 'primary'
      ? `${GRAPH_API}/me/calendar/events`
      : `${GRAPH_API}/me/calendars/${calId}/events`

    const res = await fetch(createUrl, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(eventBody),
    })
    if (!res.ok) {
      throw new Error(`[ms-calendar] Event creation failed: ${await res.text()}`)
    }
    const event = await res.json()
    await db
      .from('appointments')
      .update({ microsoft_event_id: event.id })
      .eq('id', appointmentId)
  }
}

/**
 * Deletes a Microsoft Calendar event. Silently ignores 404/410 (already deleted).
 */
export async function deleteMicrosoftEvent(
  eventId: string,
  businessId: string,
): Promise<void> {
  const db    = createServerClient()
  const token = await getValidMicrosoftToken(businessId, db)

  const res = await fetch(
    `${GRAPH_API}/me/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  )

  // 204 = success, 404/410 = already deleted — both acceptable
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`[ms-calendar] Event delete failed (${res.status}): ${await res.text()}`)
  }
}
