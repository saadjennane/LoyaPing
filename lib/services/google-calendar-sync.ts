import { createServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid Google access token, refreshing if expired (within 5 min).
 */
export async function getValidGoogleToken(
  businessId: string,
  db: SupabaseClient,
): Promise<string> {
  const { data, error } = await db
    .from('calendar_integrations')
    .select('access_token, refresh_token, token_expiry')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .maybeSingle()

  if (error) throw new Error(`[calendar-sync] DB read error: ${error.message}`)
  if (!data) throw new Error('[calendar-sync] No Google integration found')

  const expiresAt = data.token_expiry ? new Date(data.token_expiry).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  if (!needsRefresh) return data.access_token

  if (!data.refresh_token) throw new Error('[calendar-sync] No refresh token available')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`[calendar-sync] Token refresh failed: ${await tokenRes.text()}`)
  }

  const tokens = await tokenRes.json()
  const newExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  await db
    .from('calendar_integrations')
    .update({ access_token: tokens.access_token, token_expiry: newExpiry })
    .eq('business_id', businessId)
    .eq('provider', 'google')

  return tokens.access_token
}

// ── Event processing ──────────────────────────────────────────────────────────

type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string }
  end?:   { dateTime?: string; date?: string }
  attendees?: Array<{ email: string }>
}

async function processGoogleEvent(
  event: GoogleEvent,
  businessId: string,
  db: SupabaseClient,
): Promise<void> {
  // Deleted / cancelled event
  if (event.status === 'cancelled') {
    await db
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('google_event_id', event.id)
      .is('deleted_at', null)

    await db
      .from('calendar_imports')
      .delete()
      .eq('business_id', businessId)
      .eq('event_id', event.id)

    return
  }

  const startIso = event.start?.dateTime ?? event.start?.date
  if (!startIso) return // all-day events without a dateTime — skip

  const endIso   = event.end?.dateTime ?? event.end?.date ?? null
  const attendeeEmails = (event.attendees ?? []).map((a) => a.email).filter(Boolean)

  // Try to find a matching client by email
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

  // Always upsert as an appointment — client_id may be null if no email match.
  // Unassigned appointments (client_id IS NULL) appear as red dots in the agenda.
  const { error } = await db.from('appointments').upsert(
    {
      client_id:       clientId,   // null if no match — allowed since migration 037
      business_id:     businessId,
      scheduled_at:    startIso,
      ended_at:        endIso,
      notes:           event.summary ?? null,
      status:          'scheduled',
      google_event_id: event.id,
    },
    { onConflict: 'google_event_id', ignoreDuplicates: false },
  )
  if (error) console.error('[calendar-sync] upsert appointment error:', error.message)

  // Clean up any stale calendar_import for this event (legacy)
  await db.from('calendar_imports').delete().eq('business_id', businessId).eq('event_id', event.id)
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Fetches new/changed events from Google Calendar and upserts them into LoyaPing.
 * Uses incremental sync (syncToken) when available; falls back to full sync on 410.
 * Reads calendar_id from calendar_watch_channels (defaults to 'primary').
 */
export async function syncGoogleCalendar(businessId = DEFAULT_BUSINESS_ID): Promise<void> {
  const db    = createServerClient()
  const token = await getValidGoogleToken(businessId, db)

  const { data: channel } = await db
    .from('calendar_watch_channels')
    .select('sync_token, calendar_id')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .maybeSingle()

  const syncToken  = channel?.sync_token ?? null
  const calendarId = channel?.calendar_id ?? 'primary'

  const fetchEvents = async (useSyncToken: boolean): Promise<{ events: GoogleEvent[]; nextSyncToken: string | null }> => {
    const params = new URLSearchParams()
    if (useSyncToken && syncToken) {
      params.set('syncToken', syncToken)
    } else {
      params.set('timeMin', new Date().toISOString())
      params.set('singleEvents', 'true')
      params.set('orderBy', 'startTime')
      params.set('maxResults', '250')
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (res.status === 410 && useSyncToken) {
      // Sync token expired — full resync
      return fetchEvents(false)
    }

    if (!res.ok) {
      throw new Error(`[calendar-sync] Google Events API error ${res.status}: ${await res.text()}`)
    }

    const json = await res.json()
    return { events: json.items ?? [], nextSyncToken: json.nextSyncToken ?? null }
  }

  const { events, nextSyncToken } = await fetchEvents(!!syncToken)

  for (const event of events) {
    await processGoogleEvent(event, businessId, db)
  }

  // Store new syncToken for next incremental sync
  if (nextSyncToken) {
    await db
      .from('calendar_watch_channels')
      .update({ sync_token: nextSyncToken })
      .eq('business_id', businessId)
      .eq('provider', 'google')
  }
}

// ── LoyaPing → Google Calendar ───────────────────────────────────────────────

/**
 * Creates or updates a Google Calendar event from a LoyaPing appointment.
 * If the appointment already has a google_event_id, updates the existing event.
 * Otherwise creates a new event and stores the event ID on the appointment.
 * Uses the calendar_id stored in calendar_watch_channels (defaults to 'primary').
 */
export async function pushAppointmentToGoogle(
  appointmentId: string,
  businessId: string,
): Promise<void> {
  const db    = createServerClient()
  const token = await getValidGoogleToken(businessId, db)

  const { data: appt } = await db
    .from('appointments')
    .select('id, client_id, scheduled_at, ended_at, notes, google_event_id')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) return

  // Fetch client info for title, description and attendee
  let clientName: string | null = null
  let clientPhone: string | null = null
  let clientEmail: string | null = null
  if (appt.client_id) {
    const { data: client } = await db
      .from('clients')
      .select('civility, first_name, last_name, phone_number, email')
      .eq('id', appt.client_id)
      .maybeSingle()
    if (client) {
      const nameParts = [client.civility, client.first_name, client.last_name].filter(Boolean)
      clientName  = nameParts.length > 0 ? nameParts.join(' ') : client.phone_number
      clientPhone = client.phone_number ?? null
      clientEmail = client.email ?? null
    }
  }

  // Build title: "[notes] – Nom" or "RDV – Nom" or fallback
  // Build title: "RDV – Nom" or fallback
  const summary = clientName ? `RDV – ${clientName}` : 'Rendez-vous'

  // Build description: notes + phone
  const descLines: string[] = []
  if (appt.notes)  descLines.push(appt.notes)
  if (clientPhone) descLines.push(`Tél : ${clientPhone}`)
  const description = descLines.length > 0 ? descLines.join('\n') : undefined

  // Read selected calendar
  const { data: ch } = await db
    .from('calendar_watch_channels')
    .select('calendar_id')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .maybeSingle()
  const calId = encodeURIComponent(ch?.calendar_id ?? 'primary')

  // Compute end time: use ended_at or scheduled_at + 1 hour
  const startMs = new Date(appt.scheduled_at).getTime()
  const endIso  = appt.ended_at ?? new Date(startMs + 60 * 60 * 1000).toISOString()

  const eventBody = {
    summary,
    description,
    start:     { dateTime: appt.scheduled_at, timeZone: 'UTC' },
    end:       { dateTime: endIso,            timeZone: 'UTC' },
    attendees: clientEmail ? [{ email: clientEmail }] : [],
  }

  if (appt.google_event_id) {
    // Update existing event
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${appt.google_event_id}`,
      {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventBody),
      },
    )
    if (!res.ok) {
      throw new Error(`[calendar-sync] Event update failed: ${await res.text()}`)
    }
  } else {
    // Create new event
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventBody),
      },
    )
    if (!res.ok) {
      throw new Error(`[calendar-sync] Event creation failed: ${await res.text()}`)
    }
    const event = await res.json()
    // Store the Google event ID on the appointment
    await db
      .from('appointments')
      .update({ google_event_id: event.id })
      .eq('id', appointmentId)
  }
}

/**
 * Deletes a Google Calendar event. Silently ignores 404/410 (already deleted).
 * Uses the calendar_id stored in calendar_watch_channels (defaults to 'primary').
 */
export async function deleteGoogleEvent(
  googleEventId: string,
  businessId: string,
): Promise<void> {
  const db    = createServerClient()
  const token = await getValidGoogleToken(businessId, db)

  const { data: ch } = await db
    .from('calendar_watch_channels')
    .select('calendar_id')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .maybeSingle()
  const calId = encodeURIComponent(ch?.calendar_id ?? 'primary')

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${googleEventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  )

  // 204 = success, 404/410 = already deleted — both are acceptable
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`[calendar-sync] Event delete failed (${res.status}): ${await res.text()}`)
  }
}

// ── Watch channel creation ────────────────────────────────────────────────────

/**
 * Registers a Google Calendar push notification channel.
 * Upserts into calendar_watch_channels and runs an initial sync.
 * @param calendarId — Google calendar ID to watch (default: 'primary')
 */
export async function startGoogleWatch(
  businessId: string,
  db: SupabaseClient,
  accessToken: string,
  calendarId = 'primary',
): Promise<void> {
  const channelId  = crypto.randomUUID()
  const webhookUrl = `${process.env.APP_URL}/api/calendar/google/webhook`

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id:      channelId,
        type:    'web_hook',
        address: webhookUrl,
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`[calendar-sync] Watch creation failed: ${await res.text()}`)
  }

  const { id, resourceId, expiration } = await res.json()
  const expiryAt = expiration ? new Date(Number(expiration)).toISOString() : null

  await db.from('calendar_watch_channels').upsert(
    {
      business_id: businessId,
      provider:    'google',
      channel_id:  id,
      resource_id: resourceId ?? null,
      expiry_at:   expiryAt,
      calendar_id: calendarId,
    },
    { onConflict: 'business_id,provider' },
  )

  // Initial sync: pull existing upcoming events
  await syncGoogleCalendar(businessId)
}
