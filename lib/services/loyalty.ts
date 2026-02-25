import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Client, LoyaltyProgram, LoyaltyTier, Coupon, PointsLog } from '@/lib/types'
import { addDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'

// =========================================
// CREDIT POINTS TO CLIENT
// Handles tier detection + coupon generation + cycle reset + WA notification
// =========================================
export async function creditPoints({
  clientId,
  businessId,
  points,
  sourceType,
  sourceId,
  program: programOverride,
}: {
  clientId: string
  businessId: string
  points: number
  sourceType: 'order' | 'appointment' | 'manual'
  sourceId?: string
  program?: LoyaltyProgram  // optional: pass already-fetched program to save a query
}): Promise<{ newPoints: number; couponsGenerated: Coupon[] }> {
  const db = createServerClient()

  // Fetch client + (optionally) program + tiers in parallel
  const [clientRes, programRes, tiersRes] = await Promise.all([
    db.from('clients').select('*').eq('id', clientId).single(),
    programOverride
      ? Promise.resolve({ data: programOverride, error: null })
      : db.from('loyalty_programs').select('*').eq('business_id', businessId).eq('is_active', true).maybeSingle(),
    db.from('loyalty_tiers').select('*').eq('business_id', businessId).order('tier_order', { ascending: true }),
  ])

  if (clientRes.error || !clientRes.data) throw new Error('Client not found')
  const client = clientRes.data as Client
  const program = programRes.data as LoyaltyProgram | null
  const tiers = (tiersRes.data ?? []) as LoyaltyTier[]

  if (!program || tiers.length === 0) {
    return { newPoints: client.current_cycle_points, couponsGenerated: [] }
  }

  const cycleBefore = client.current_cycle_points
  let cyclePoints = cycleBefore + points
  const couponsToCreate: (Omit<Coupon, 'id' | 'created_at' | 'tier'> & { _tier: LoyaltyTier })[] = []

  const sortedTiers = [...tiers].sort((a, b) => a.tier_order - b.tier_order)

  for (const tier of sortedTiers) {
    if (!tier.is_enabled) continue
    if (cyclePoints >= tier.required_points) {
      // Generate coupon for this tier
      const expiresAt = tier.validity_days ? addDays(new Date(), tier.validity_days) : addDays(new Date(), 3650) // ~10y if no expiry
      couponsToCreate.push({
        client_id: clientId,
        tier_id: tier.id,
        status: 'active',
        source: 'tier_unlock' as const,
        used_at: null,
        redemption_code: null,
        redemption_code_expires_at: null,
        expires_at: expiresAt.toISOString(),
        _tier: tier,
      })
    }
  }

  // Reset cycle after last enabled tier crossing
  const lastEnabledTier = [...sortedTiers].reverse().find((t) => t.is_enabled)
  if (lastEnabledTier && cyclePoints >= lastEnabledTier.required_points) {
    cyclePoints = 0
  }

  // Persist
  const totalPoints = client.loyalty_points + points
  const totalCycles = client.total_cycles_completed + (couponsToCreate.some((c) => {
    return c._tier.tier_order === (lastEnabledTier?.tier_order ?? 0)
  }) ? 1 : 0)

  const updateErr = await db.from('clients').update({
    loyalty_points: totalPoints,
    current_cycle_points: cyclePoints,
    total_cycles_completed: totalCycles,
  }).eq('id', clientId).then((r) => r.error)

  if (updateErr) throw updateErr

  // Insert coupons (strip internal _tier field)
  let generatedCoupons: Coupon[] = []
  if (couponsToCreate.length > 0) {
    const rows = couponsToCreate.map(({ _tier: _unused, ...rest }) => rest)
    const { data, error } = await db.from('coupons').insert(rows).select()
    if (error) throw error
    generatedCoupons = data as Coupon[]
  }

  // Log
  await db.from('points_log').insert({
    client_id: clientId,
    business_id: businessId,
    source_type: sourceType,
    source_id: sourceId ?? null,
    points_delta: points,
    cycle_points_before: cycleBefore,
    cycle_points_after: cyclePoints,
  })

  // Send tier-reached WhatsApp notifications (best-effort)
  // TODO: fetch client phone once from clientRes when notify_on_tier is wired to send at coupon creation time
  if (program.notify_on_tier && couponsToCreate.length > 0 && client.phone_number) {
    for (const entry of couponsToCreate) {
      const tier = entry._tier
      const template = tier.notification_message_template
      if (!template) continue

      let message = template
      if (tier.validity_days) {
        const expiry = format(addDays(new Date(), tier.validity_days), 'd MMMM yyyy', { locale: fr })
        message = message.replace(/#{expiry_date}/g, expiry)
      }
      message = message.replace(/#{reward_title}/g, tier.reward_title ?? tier.reward_description ?? '')

      try {
        await sendWhatsAppMessage({ to: client.phone_number, text: message })
      } catch (e) {
        console.error(`[loyalty] Failed to send tier notification for tier ${tier.tier_order}:`, e)
      }
    }
  }

  return { newPoints: cyclePoints, couponsGenerated: generatedCoupons }
}

// =========================================
// REVERSE A SPECIFIC SOURCE CREDIT
// Used when an appointment/order is un-marked (show → scheduled)
// =========================================
export async function reverseSourceCredit({
  clientId,
  businessId,
  sourceType,
  sourceId,
}: {
  clientId: string
  businessId: string
  sourceType: string
  sourceId: string
}): Promise<{ reversed: boolean; delta: number }> {
  const db = createServerClient()

  // Find the original credit log entry for this specific source
  const { data: log } = await db
    .from('points_log')
    .select('*')
    .eq('client_id', clientId)
    .eq('business_id', businessId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .gt('points_delta', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!log || !(log as PointsLog).points_delta) return { reversed: false, delta: 0 }

  const pointsLog = log as PointsLog
  const delta = pointsLog.points_delta

  const { data: client } = await db
    .from('clients')
    .select('loyalty_points, current_cycle_points')
    .eq('id', clientId)
    .single()

  if (!client) throw new Error('Client not found')

  const newLoyaltyPoints = Math.max(0, (client.loyalty_points as number) - delta)
  const newCyclePoints   = Math.max(0, (client.current_cycle_points as number) - delta)

  await db.from('clients').update({
    loyalty_points:       newLoyaltyPoints,
    current_cycle_points: newCyclePoints,
  }).eq('id', clientId)

  await db.from('points_log').insert({
    client_id:           clientId,
    business_id:         businessId,
    source_type:         'undo',
    source_id:           pointsLog.id,
    points_delta:        -delta,
    cycle_points_before: client.current_cycle_points,
    cycle_points_after:  newCyclePoints,
  })

  return { reversed: true, delta }
}

// =========================================
// UNDO LAST POINTS CREDIT
// =========================================
export async function undoLastCredit(clientId: string, businessId: string) {
  const db = createServerClient()

  const { data: lastLog } = await db
    .from('points_log')
    .select('*')
    .eq('client_id', clientId)
    .eq('business_id', businessId)
    .not('source_type', 'eq', 'undo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastLog) throw new Error('No credit to undo')

  const log = lastLog as PointsLog

  // Restore cycle points to before state
  await db.from('clients').update({
    loyalty_points: db.rpc as never, // handled below with raw delta
  }).eq('id', clientId)

  // Use raw update with delta
  const { data: client } = await db.from('clients').select('loyalty_points, current_cycle_points').eq('id', clientId).single()
  if (!client) throw new Error('Client not found')

  await db.from('clients').update({
    loyalty_points: (client.loyalty_points as number) - log.points_delta,
    current_cycle_points: log.cycle_points_before,
  }).eq('id', clientId)

  // Log the undo
  await db.from('points_log').insert({
    client_id: clientId,
    business_id: businessId,
    source_type: 'undo',
    source_id: log.id,
    points_delta: -log.points_delta,
    cycle_points_before: log.cycle_points_after,
    cycle_points_after: log.cycle_points_before,
  })

  return { undone: true, delta: log.points_delta }
}

// =========================================
// GENERATE REDEMPTION CODE (10 min window)
// =========================================
export async function generateRedemptionCode(couponId: string): Promise<{ code: string }> {
  const db = createServerClient()

  const { data: coupon, error } = await db
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .eq('status', 'active')
    .single()

  if (error || !coupon) throw new Error('Coupon not found or not active')

  const now = new Date()
  const existing = coupon as Coupon
  // Re-use valid existing code
  if (existing.redemption_code && existing.redemption_code_expires_at) {
    const expiry = new Date(existing.redemption_code_expires_at)
    if (expiry > now) return { code: existing.redemption_code }
  }

  // Generate new 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000) // +10 minutes

  await db.from('coupons').update({
    redemption_code: code,
    redemption_code_expires_at: expiresAt.toISOString(),
  }).eq('id', couponId)

  return { code }
}

// =========================================
// REDEEM COUPON (vendor side)
// =========================================
export async function redeemCoupon(code: string, businessId: string): Promise<Coupon> {
  const db = createServerClient()

  const { data: coupon, error } = await db
    .from('coupons')
    .select('*, tier:loyalty_tiers(*), client:clients(*)')
    .eq('redemption_code', code)
    .eq('status', 'active')
    .single()

  if (error || !coupon) throw new Error('Code invalide ou coupon introuvable')

  const now = new Date()
  if (!coupon.redemption_code_expires_at || new Date(coupon.redemption_code_expires_at) < now) {
    throw new Error('Code expiré (valide 10 minutes)')
  }
  if (new Date(coupon.expires_at) < now) {
    await db.from('coupons').update({ status: 'expired' }).eq('id', coupon.id)
    throw new Error('Ce coupon a expiré')
  }

  // Verify coupon belongs to this business via client
  const client = coupon.client as Client
  if (client.business_id !== businessId) {
    throw new Error('Ce coupon n\'appartient pas à votre commerce')
  }

  const { data: updated, error: updateError } = await db
    .from('coupons')
    .update({ status: 'used', redemption_code: null, redemption_code_expires_at: null })
    .eq('id', coupon.id)
    .select()
    .single()

  if (updateError) throw updateError
  return updated as Coupon
}

// =========================================
// EXPIRE STALE COUPONS (called by job)
// =========================================
export async function expireStaleRedemptionCodes() {
  const db = createServerClient()
  const now = new Date().toISOString()

  await db
    .from('coupons')
    .update({ redemption_code: null, redemption_code_expires_at: null })
    .lt('redemption_code_expires_at', now)
    .not('redemption_code', 'is', null)

  // Expire coupons past their validity
  await db
    .from('coupons')
    .update({ status: 'expired' })
    .lt('expires_at', now)
    .eq('status', 'active')
}
