import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Client, ClientPageData, LoyaltyProgram, LoyaltyTier, Coupon, Appointment, Order, PortalGlobalData, PortalBusinessData } from '@/lib/types'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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
export async function updateClientPhone(clientId: string, newPhone: string): Promise<Client> {
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
// Auto-reply with magic link if program active
// =========================================
export async function handleIncomingMessage(fromPhone: string): Promise<void> {
  const db = createServerClient()

  // Normalize phone (strip spaces)
  const phone = fromPhone.replace(/\s+/g, '')

  // Find client by phone across all businesses
  // For Phase 1: single universal number — find which business they belong to
  const { data: clients } = await db
    .from('clients')
    .select('*, business:businesses(*)')
    .eq('phone_number', phone)

  if (!clients || clients.length === 0) return

  for (const client of clients as (Client & { business: { id: string; name: string } })[]) {
    // Check if business has active loyalty program
    const { data: program } = await db
      .from('loyalty_programs')
      .select('id')
      .eq('business_id', client.business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!program) continue // No active program → no reply

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
  const { data: allClients } = await db
    .from('clients')
    .select('id, business_id, current_cycle_points')
    .eq('phone_number', baseClient.phone_number)

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

  // Find the client record for this specific business (same phone)
  const { data: clientRow } = await db
    .from('clients')
    .select('id, business_id, current_cycle_points')
    .eq('phone_number', baseClient.phone_number)
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
