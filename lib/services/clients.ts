import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { createAndNotifyUrgentEvent } from '@/lib/services/urgent-notifications'
import { Reviews } from '@/lib/posthog/reviews'
import type { Client, ClientPageData, LoyaltyProgram, LoyaltyTier, Coupon, Appointment, Order, PortalGlobalData, PortalBusinessData } from '@/lib/types'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// Window in which a button reply is considered a review response
const REVIEW_RESPONSE_WINDOW_DAYS = 7

// Button IDs used in the review request interactive message
export const REVIEW_BTN_POSITIVE = 'review_positive'
export const REVIEW_BTN_NEGATIVE = 'review_negative'

// Appointment button ID prefixes (format: appt_confirm_{id} / appt_reschedule_{id})
export const APPT_CONFIRM_PREFIX    = 'appt_confirm_'
export const APPT_RESCHEDULE_PREFIX = 'appt_reschedule_'

// The portal link is only sent when the client asks for it. With Coexistence
// the merchant chats from the WhatsApp Business app, so an automatic reply to
// every message would interrupt real conversations.
const MAGIC_LINK_KEYWORDS = /(^|[^\p{L}])(lien|link|espace|compte|points?|fid[eé]lit[eé]|r[eé]compenses?|carte|solde)(?=$|[^\p{L}])/iu

// =========================================
// SAME PERSON (portal ownership checks)
// The same person has one client row per business, linked by phone number.
// A client without phone only matches itself — never compare null phones.
// =========================================
export function isSamePerson(
  a: { id: string; phone_number: string | null },
  b: { id: string; phone_number: string | null },
): boolean {
  if (a.id === b.id) return true
  return !!a.phone_number && a.phone_number === b.phone_number
}

// =========================================
// GET CLIENT PAGE DATA (magic link)
// =========================================
export async function getClientPageData(token: string): Promise<ClientPageData | null> {
  const db = createServerClient()

  const { data: client, error } = await db
    .from('clients')
    .select('*, business:businesses(*)')
    .eq('magic_token', token)
    .maybeSingle()

  if (error || !client) return null

  const business = client.business

  const [programRes, tiersRes, couponsRes, appointmentsRes, ordersRes] = await Promise.all([
    db.from('loyalty_programs').select('*').eq('business_id', client.business_id).eq('is_active', true).maybeSingle(),
    db.from('loyalty_tiers').select('*').eq('business_id', client.business_id).order('tier_order', { ascending: true }),
    db.from('coupons').select('*, tier:loyalty_tiers(*)').eq('client_id', client.id).eq('status', 'active').order('created_at', { ascending: false }),
    db.from('appointments').select('*').eq('client_id', client.id).eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }),
    db.from('orders').select('*').eq('client_id', client.id).in('status', ['pending', 'ready']).order('created_at', { ascending: false }),
  ])

  return {
    client: client as Client,
    business,
    program: programRes.data as LoyaltyProgram | null,
    tiers: (tiersRes.data ?? []) as LoyaltyTier[],
    coupons: (couponsRes.data ?? []) as Coupon[],
    appointments: (appointmentsRes.data ?? []) as Appointment[],
    orders: (ordersRes.data ?? []) as Order[],
  }
}

// =========================================
// CHANGE PHONE NUMBER → regenerate token
// =========================================
export async function updateClientPhone(clientId: string, newPhone: string | null): Promise<Client> {
  const db = createServerClient()

  // Generate new token using crypto
  const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')

  const { data, error } = await db
    .from('clients')
    .update({ phone_number: newPhone, magic_token: newToken })
    .eq('id', clientId)
    .select()
    .single()

  if (error) throw error
  return data as Client
}

// =========================================
// HANDLE INCOMING WHATSAPP MESSAGE
// 1. If client has a pending review request → handle review response
// 2. Otherwise → auto-reply with magic link if loyalty program active
// =========================================
export async function handleIncomingMessage(fromPhone: string, messageBody = '', buttonId?: string): Promise<void> {
  const db = createServerClient()

  const phone = normalizePhone(fromPhone)

  // ── Conversation thread routing ────────────────────────────────────────────
  // If the sender has an active (OPEN or IN_PROGRESS) conversation, append the
  // inbound message and skip all other processing (reviews, magic link, etc.).
  // This handles the back-and-forth after a client clicked "Non".
  const { data: activeConv } = await db
    .from('conversations')
    .select('id, status')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .eq('phone', phone)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (activeConv) {
    await db.from('conversation_messages').insert({
      conversation_id: activeConv.id,
      direction: 'inbound',
      body: messageBody || '(bouton)',
    })
    await db.from('conversations')
      .update({ last_inbound_at: new Date().toISOString() })
      .eq('id', activeConv.id)
    return
  }

  // ── Appointment button handling (confirm / reschedule_requested) ───────────
  // These button IDs embed the appointment ID directly, so we can route them
  // without knowing the client first.
  if (buttonId) {
    if (buttonId.startsWith(APPT_CONFIRM_PREFIX)) {
      const appointmentId = buttonId.slice(APPT_CONFIRM_PREFIX.length)
      const now = new Date().toISOString()
      await db.from('appointments')
        .update({ status: 'confirmed', confirmed_at: now })
        .eq('id', appointmentId)
        .eq('business_id', DEFAULT_BUSINESS_ID)
      db.from('appointment_events')
        .insert({ appointment_id: appointmentId, type: 'confirmed' })
        .then(() => {})
      return
    }

    if (buttonId.startsWith(APPT_RESCHEDULE_PREFIX)) {
      const appointmentId = buttonId.slice(APPT_RESCHEDULE_PREFIX.length)
      const now = new Date().toISOString()

      const { data: current } = await db.from('appointments')
        .select('scheduled_at')
        .eq('id', appointmentId)
        .maybeSingle()

      const updates: Record<string, string | null> = {
        status: 'reschedule_requested',
        reschedule_requested_at: now,
      }
      if (current?.scheduled_at) {
        const d = new Date(current.scheduled_at)
        updates.stored_previous_date = d.toISOString().slice(0, 10)
        updates.stored_previous_time = d.toISOString().slice(11, 19)
      }

      await db.from('appointments')
        .update(updates)
        .eq('id', appointmentId)
        .eq('business_id', DEFAULT_BUSINESS_ID)

      // Cancel pending reminders — slot is now free
      const { cancelAppointmentReminders } = await import('@/lib/services/appointment-reminders')
      cancelAppointmentReminders(appointmentId).catch((e) =>
        console.error('[clients] cancel reminders on reschedule error:', e)
      )

      db.from('appointment_events')
        .insert({ appointment_id: appointmentId, type: 'reschedule_requested' })
        .then(() => {})

      createAndNotifyUrgentEvent('reschedule', appointmentId, DEFAULT_BUSINESS_ID).catch((e) =>
        console.error('[clients] urgent notification error:', e)
      )
      return
    }
  }

  const { data: clients } = await db
    .from('clients')
    .select('*, business:businesses(*)')
    .eq('phone_number', phone)

  if (!clients || clients.length === 0) return

  for (const client of clients as (Client & {
    business: { id: string; name: string }
    last_review_request_at?: string | null
    review_intent?: boolean | null
  })[]) {

    // ── Review response handling ───────────────────────────────────────
    const responseWindowMs = REVIEW_RESPONSE_WINDOW_DAYS * 86_400_000
    const requestedAt = client.last_review_request_at
      ? new Date(client.last_review_request_at).getTime()
      : null

    // Only handle button replies for reviews (not free text)
    const sentiment: 'positive' | 'negative' | null =
      buttonId === REVIEW_BTN_POSITIVE ? 'positive' :
      buttonId === REVIEW_BTN_NEGATIVE ? 'negative' :
      null

    const hasPendingRequest =
      requestedAt !== null &&
      !client.review_intent &&
      Date.now() - requestedAt <= responseWindowMs

    if (hasPendingRequest && sentiment) {

      if (sentiment === 'positive') {
        // Fetch review settings for the business
        const { data: reviewSettings } = await db
          .from('review_settings')
          .select('positive_message, google_review_link, is_active')
          .eq('business_id', client.business_id)
          .maybeSingle()

        if (reviewSettings?.is_active) {
          let replyText = reviewSettings.positive_message ??
            'Super ! Vous pouvez nous laisser un avis ici 🙏'
          if (reviewSettings.google_review_link) {
            replyText += `\n${reviewSettings.google_review_link}`
          }

          await sendWhatsAppMessage({ to: phone, text: replyText }).catch((err) =>
            console.error('[clients] review positive reply error:', err)
          )

          // Mark client as satisfied
          await db.from('clients').update({ review_intent: true }).eq('id', client.id)

          // Record events
          const { data: posEvent } = await db.from('reviews_events').insert({
            business_id: client.business_id,
            client_id: client.id,
            type: 'positive_response',
            message_content: messageBody,
          }).select().single()

          if (reviewSettings.google_review_link && posEvent) {
            await db.from('reviews_events').insert({
              business_id: client.business_id,
              client_id: client.id,
              type: 'google_intent',
            })
            Reviews.redirectToGoogle({ client_id: client.id })
          }

          Reviews.positiveClicked({ client_id: client.id })
          continue // handled — don't send magic link
        }
      }

      if (sentiment === 'negative') {
        const { data: reviewSettings } = await db
          .from('review_settings')
          .select('negative_message, is_active')
          .eq('business_id', client.business_id)
          .maybeSingle()

        if (reviewSettings?.is_active) {
          const replyText = reviewSettings.negative_message ??
            'Merci pour votre retour. Nous allons y remédier rapidement !'

          await sendWhatsAppMessage({ to: phone, text: replyText }).catch((err) =>
            console.error('[clients] review negative reply error:', err)
          )

          const { data: negEvent } = await db.from('reviews_events').insert({
            business_id: client.business_id,
            client_id: client.id,
            type: 'negative_response',
            message_content: messageBody,
          }).select().single()

          if (negEvent) {
            createAndNotifyUrgentEvent('negative_review', negEvent.id, client.business_id).catch(
              (e) => console.error('[clients] urgent notification error:', e)
            )
          }

          // ── Create conversation thread ──────────────────────────────────
          // Idempotent: the unique partial index prevents duplicate active
          // conversations for the same phone+business.
          const convInsert = await db.from('conversations').insert({
            business_id: client.business_id,
            client_id:   client.id,
            phone,
            status:      'TO_TREAT',
            last_inbound_at: new Date().toISOString(),
          }).select('id').maybeSingle()

          // Log the initial "Non" as the first inbound message
          if (convInsert.data?.id) {
            db.from('conversation_messages').insert({
              conversation_id: convInsert.data.id,
              direction: 'inbound',
              body: messageBody || 'Non (bouton)',
            }).then(() => {})
          }

          Reviews.negativeClicked({ client_id: client.id })
          continue // handled — don't send magic link
        }
      }
    }

    // ── Fallback: magic link (loyalty portal), only on request ────────
    if (buttonId || !MAGIC_LINK_KEYWORDS.test(messageBody)) continue

    const { data: program } = await db
      .from('loyalty_programs')
      .select('id')
      .eq('business_id', client.business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!program) continue

    const magicLink = `${BASE_URL}/u/${client.magic_token}`
    const message =
      `Bonjour, voici le lien pour accéder à votre espace personnel où vous trouverez ` +
      `vos récompenses, rendez-vous et commandes en cours : ${magicLink}`

    await sendWhatsAppMessage({ to: phone, text: message }).catch((err) =>
      console.error('[clients] auto-reply error:', err)
    )
  }
}

// =========================================
// MERCHANT ECHO (Coexistence)
// A message typed by the merchant in the WhatsApp Business app. If a
// conversation is open with this client, log it as an outbound message so
// the thread in LoyaPing stays complete. Otherwise ignore it.
// =========================================
export async function handleBusinessEcho(toPhone: string, messageBody: string): Promise<void> {
  const db = createServerClient()
  const phone = normalizePhone(toPhone)

  const { data: conv } = await db
    .from('conversations')
    .select('id, status')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .eq('phone', phone)
    .neq('status', 'RESOLVED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) return

  await db.from('conversation_messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    body: messageBody || '(message)',
  })

  // Same transition as a reply sent from LoyaPing
  if (conv.status === 'TO_TREAT' || conv.status === 'OPEN') {
    await db.from('conversations').update({ status: 'IN_PROGRESS' }).eq('id', conv.id)
  }
}

// =========================================
// PORTAL — GLOBAL VIEW (multi-business)
// =========================================
export async function getPortalGlobalData(token: string): Promise<PortalGlobalData | null> {
  const db = createServerClient()

  // 1) Validate token → find client
  const { data: baseClient } = await db
    .from('clients')
    .select('id, phone_number, business_id')
    .eq('magic_token', token)
    .maybeSingle()

  if (!baseClient) return null

  // 2) Find ALL client records sharing this phone number
  //    (a client without phone only has its own record)
  const { data: allClients } = await db
    .from('clients')
    .select('id, business_id, current_cycle_points')
    .eq(baseClient.phone_number ? 'phone_number' : 'id', baseClient.phone_number ?? baseClient.id)

  if (!allClients || allClients.length === 0) return null

  const clientIds   = allClients.map((c) => c.id)
  const businessIds = allClients.map((c) => c.business_id)

  // 3) Batch-fetch all data in parallel
  const [profilesRes, modulesRes, hoursRes, ordersRes, apptsRes, programsRes, tiersRes, couponsRes] = await Promise.all([
    db.from('business_profile').select('*').in('business_id', businessIds),
    db.from('business_modules').select('*').in('business_id', businessIds),
    db.from('business_hours').select('*').in('business_id', businessIds).order('day_of_week'),
    db.from('orders').select('*').in('client_id', clientIds).in('status', ['pending', 'ready']).is('deleted_at', null).order('created_at', { ascending: false }),
    db.from('appointments').select('*').in('client_id', clientIds).eq('status', 'scheduled').is('deleted_at', null).gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }),
    db.from('loyalty_programs').select('*').in('business_id', businessIds).eq('is_active', true),
    db.from('loyalty_tiers').select('*').in('business_id', businessIds).order('tier_order', { ascending: true }),
    db.from('coupons').select('*, tier:loyalty_tiers(*)').in('client_id', clientIds).eq('status', 'active').order('created_at', { ascending: false }),
  ])

  const profiles  = profilesRes.data  ?? []
  const modules   = modulesRes.data   ?? []
  const hours     = hoursRes.data     ?? []
  const orders    = (ordersRes.data   ?? []) as Order[]
  const appts     = (apptsRes.data    ?? []) as Appointment[]
  const programs  = (programsRes.data ?? []) as LoyaltyProgram[]
  const tiers     = (tiersRes.data    ?? []) as LoyaltyTier[]
  const coupons   = (couponsRes.data  ?? []) as Coupon[]

  // 4) Assemble per-business data
  const businesses: PortalBusinessData[] = allClients.map((c) => {
    const profile = profiles.find((p) => p.business_id === c.business_id)
    const mod     = modules.find((m) => m.business_id === c.business_id)
    return {
      id:              c.business_id,
      client_id:       c.id,
      client_points:   c.current_cycle_points,
      name:            profile?.name            ?? '',
      logo_url:        profile?.logo_url        ?? null,
      primary_color:   profile?.primary_color   ?? null,
      secondary_color: profile?.secondary_color ?? null,
      address:         profile?.address         ?? null,
      google_maps_url: profile?.google_maps_url ?? null,
      waze_url:        profile?.waze_url        ?? null,
      phone:           profile?.phone           ?? null,
      email:           profile?.email           ?? null,
      website:         profile?.website         ?? null,
      instagram_url:   profile?.instagram_url   ?? null,
      tiktok_url:      profile?.tiktok_url      ?? null,
      facebook_url:    profile?.facebook_url    ?? null,
      youtube_url:     profile?.youtube_url     ?? null,
      hours:           hours.filter((h) => h.business_id === c.business_id),
      modules: {
        orders_enabled:       mod?.orders_enabled       ?? true,
        appointments_enabled: mod?.appointments_enabled ?? true,
        loyalty_enabled:      mod?.loyalty_enabled      ?? true,
      },
      active_orders:         orders.filter((o) => o.client_id === c.id),
      upcoming_appointments: appts.filter((a) => a.client_id === c.id),
      program:               programs.find((p) => p.business_id === c.business_id) ?? null,
      tiers:                 tiers.filter((t) => t.business_id === c.business_id),
      active_coupons:        coupons.filter((cp) => cp.client_id === c.id),
    }
  })

  return { token, phone_number: baseClient.phone_number, businesses }
}

// =========================================
// PORTAL — BUSINESS DETAIL VIEW
// =========================================
export async function getPortalBusinessData(
  token: string,
  businessId: string,
): Promise<{ data: PortalBusinessData } | null> {
  const db = createServerClient()

  // Validate token
  const { data: baseClient } = await db
    .from('clients')
    .select('id, phone_number')
    .eq('magic_token', token)
    .maybeSingle()
  if (!baseClient) return null

  // Find the client record for this specific business (same phone, or the
  // client itself when it has no phone)
  const { data: clientRow } = await db
    .from('clients')
    .select('id, business_id, current_cycle_points')
    .eq(baseClient.phone_number ? 'phone_number' : 'id', baseClient.phone_number ?? baseClient.id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!clientRow) return null

  const clientId = clientRow.id

  const [profileRes, modRes, hoursRes, ordersRes, apptsRes, programRes, tiersRes, couponsRes] = await Promise.all([
    db.from('business_profile').select('*').eq('business_id', businessId).maybeSingle(),
    db.from('business_modules').select('*').eq('business_id', businessId).maybeSingle(),
    db.from('business_hours').select('*').eq('business_id', businessId).order('day_of_week'),
    db.from('orders').select('*').eq('client_id', clientId).in('status', ['pending', 'ready']).is('deleted_at', null).order('created_at', { ascending: false }),
    db.from('appointments').select('*').eq('client_id', clientId).eq('status', 'scheduled').is('deleted_at', null).gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }),
    db.from('loyalty_programs').select('*').eq('business_id', businessId).eq('is_active', true).maybeSingle(),
    db.from('loyalty_tiers').select('*').eq('business_id', businessId).order('tier_order', { ascending: true }),
    db.from('coupons').select('*, tier:loyalty_tiers(*)').eq('client_id', clientId).eq('status', 'active').order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data
  const mod     = modRes.data

  const biz: PortalBusinessData = {
    id:              businessId,
    client_id:       clientId,
    client_points:   clientRow.current_cycle_points,
    name:            profile?.name            ?? '',
    logo_url:        profile?.logo_url        ?? null,
    primary_color:   profile?.primary_color   ?? null,
    secondary_color: profile?.secondary_color ?? null,
    address:         profile?.address         ?? null,
    google_maps_url: profile?.google_maps_url ?? null,
    waze_url:        profile?.waze_url        ?? null,
    phone:           profile?.phone           ?? null,
    email:           profile?.email           ?? null,
    website:         profile?.website         ?? null,
    instagram_url:   profile?.instagram_url   ?? null,
    tiktok_url:      profile?.tiktok_url      ?? null,
    facebook_url:    profile?.facebook_url    ?? null,
    youtube_url:     profile?.youtube_url     ?? null,
    hours:           (hoursRes.data ?? []),
    modules: {
      orders_enabled:       mod?.orders_enabled       ?? true,
      appointments_enabled: mod?.appointments_enabled ?? true,
      loyalty_enabled:      mod?.loyalty_enabled      ?? true,
    },
    active_orders:         (ordersRes.data  ?? []) as Order[],
    upcoming_appointments: (apptsRes.data   ?? []) as Appointment[],
    program:               (programRes.data ?? null) as LoyaltyProgram | null,
    tiers:                 (tiersRes.data   ?? []) as LoyaltyTier[],
    active_coupons:        (couponsRes.data ?? []) as Coupon[],
  }

  return { data: biz }
}
