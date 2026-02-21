import { createServerClient } from '@/lib/supabase/server'
import { creditPoints } from '@/lib/services/loyalty'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Appointment, AppointmentListItem, Client, LoyaltyProgram } from '@/lib/types'

// =========================================
// MARK APPOINTMENT AS SHOW → credit points
// =========================================
export async function markAppointmentShow(
  appointmentId: string,
  amount?: number,
): Promise<Appointment & { pointsCredited: number }> {
  const db = createServerClient()

  const { data: appt, error } = await db
    .from('appointments')
    .select('*, client:clients(*)')
    .eq('id', appointmentId)
    .eq('status', 'scheduled')
    .single()

  if (error || !appt) throw new Error('Appointment not found or not scheduled')
  if (appt.points_credited) throw new Error('Points already credited')

  const now = new Date().toISOString()

  await db
    .from('appointments')
    .update({
      status: 'show',
      points_credited: true,
      show_at: now,
      ...(amount !== undefined ? { amount } : {}),
    })
    .eq('id', appointmentId)

  const program = await db
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', appt.business_id)
    .eq('is_active', true)
    .maybeSingle()
    .then((r) => r.data as LoyaltyProgram | null)

  let pointsToCredit = 0
  if (program) {
    if (program.type === 'passage') {
      pointsToCredit = (program as LoyaltyProgram).points_per_visit ?? 1
    } else if (program.type === 'montant') {
      const cap = (program as LoyaltyProgram).conversion_amount_per_point
      const legacyRate = program.conversion_rate
      const effectiveAmount = amount ?? 0
      if (cap && cap > 0) {
        pointsToCredit = Math.floor(effectiveAmount / cap)
      } else if (legacyRate && legacyRate > 0) {
        pointsToCredit = Math.floor(effectiveAmount * legacyRate)
      }
    }
  }

  if (pointsToCredit > 0) {
    await creditPoints({
      clientId: appt.client_id,
      businessId: appt.business_id,
      points: pointsToCredit,
      sourceType: 'appointment',
      sourceId: appointmentId,
      program: program as LoyaltyProgram | undefined,
    })
  }

  // Send post-show WhatsApp message (best-effort)
  try {
    const { data: notifSettings } = await db
      .from('appointment_notification_settings')
      .select('post_messages_enabled, post_show_message')
      .eq('business_id', appt.business_id)
      .maybeSingle()

    const phone = (appt.client as Client | undefined)?.phone_number
    if (phone && notifSettings?.post_messages_enabled && notifSettings?.post_show_message) {
      await sendWhatsAppMessage({ to: phone, text: notifSettings.post_show_message })
    }
  } catch (e) {
    console.error('[appointments] Failed to send post-show message:', e)
  }

  return { ...(appt as Appointment), pointsCredited: pointsToCredit }
}

// =========================================
// MARK AS NO SHOW (no credit)
// =========================================
export async function markNoShow(appointmentId: string): Promise<void> {
  const db = createServerClient()

  // Fetch appointment before updating (need business_id + client phone)
  const { data: appt } = await db
    .from('appointments')
    .select('business_id, client:clients(phone_number)')
    .eq('id', appointmentId)
    .eq('status', 'scheduled')
    .maybeSingle()

  const { error } = await db
    .from('appointments')
    .update({ status: 'no_show', no_show_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', 'scheduled')

  if (error) throw error

  // Send post-no-show WhatsApp message (best-effort)
  if (appt) {
    try {
      const { data: notifSettings } = await db
        .from('appointment_notification_settings')
        .select('post_messages_enabled, post_no_show_message')
        .eq('business_id', appt.business_id)
        .maybeSingle()

      const clientData = appt.client as unknown as { phone_number: string } | null
      const phone = clientData?.phone_number
      if (phone && notifSettings?.post_messages_enabled && notifSettings?.post_no_show_message) {
        await sendWhatsAppMessage({ to: phone, text: notifSettings.post_no_show_message })
      }
    } catch (e) {
      console.error('[appointments] Failed to send post-no-show message:', e)
    }
  }
}

// =========================================
// LIST UPCOMING APPOINTMENTS for a business
// =========================================
export async function getUpcomingAppointments(businessId: string): Promise<Appointment[]> {
  const db = createServerClient()

  const { data, error } = await db
    .from('appointments')
    .select('*, client:clients(id, phone_number, magic_token)')
    .eq('business_id', businessId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Appointment[]
}

// =========================================
// LIST ALL APPOINTMENTS for a business (all statuses, all dates)
// =========================================
export async function getAllAppointments(businessId: string): Promise<Appointment[]> {
  const db = createServerClient()

  const { data, error } = await db
    .from('appointments')
    .select('*, client:clients(id, civility, first_name, last_name, phone_number, magic_token), reminders:reminder_sends(*)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Appointment[]
}

// =========================================
// LIST APPOINTMENTS — upcoming or history (lightweight)
// Used by GET /api/appointments/list
// =========================================
export async function getAppointmentList(params: {
  businessId:   string
  mode:         'upcoming' | 'history'
  from:         string   // ISO date (inclusive, start of day)
  to:           string   // ISO date (inclusive, end of day)
  statusFilter: 'all' | 'upcoming' | 'show' | 'no_show'
  notifFilter:  'all' | 'failed_only'
}): Promise<AppointmentListItem[]> {
  const db = createServerClient()

  const fromDt = new Date(params.from)
  fromDt.setUTCHours(0, 0, 0, 0)

  const toDt = new Date(params.to)
  toDt.setUTCHours(23, 59, 59, 999)

  let query = db
    .from('appointments')
    .select('id, scheduled_at, status, client:clients(civility, first_name, last_name, phone_number), reminders:reminder_sends(id, status)')
    .eq('business_id', params.businessId)
    .is('deleted_at', null)
    .gte('scheduled_at', fromDt.toISOString())
    .lte('scheduled_at', toDt.toISOString())

  // 'upcoming' param = status='scheduled' in DB
  if (params.statusFilter === 'upcoming')      query = query.eq('status', 'scheduled')
  else if (params.statusFilter === 'show')     query = query.eq('status', 'show')
  else if (params.statusFilter === 'no_show')  query = query.eq('status', 'no_show')

  // upcoming mode → ASC, history → DESC
  query = query.order('scheduled_at', { ascending: params.mode === 'upcoming' })

  const { data, error } = await query
  if (error) throw error

  type Row = {
    id: string
    scheduled_at: string
    status: 'scheduled' | 'show' | 'no_show'
    client: { civility: string | null; first_name: string | null; last_name: string | null; phone_number: string } | null
    reminders: Array<{ id: string; status: string }>
  }

  const rows = (data ?? []) as unknown as Row[]

  // Apply notifFilter in JS (avoids complex PostgREST nested filter)
  const filtered = params.notifFilter === 'failed_only'
    ? rows.filter((r) => (Array.isArray(r.reminders) ? r.reminders : []).some((rem) => rem.status === 'failed'))
    : rows

  return filtered.map((r) => {
    // PostgREST returns 1-to-1 joins as object (not array) — handle both defensively
    const c = Array.isArray(r.client) ? r.client[0] : r.client
    const nameParts = [c?.civility, c?.first_name, c?.last_name].filter(Boolean)
    const client_name = nameParts.length > 0 ? nameParts.join(' ') : (c?.phone_number ?? '—')
    const rems = Array.isArray(r.reminders) ? r.reminders : []
    return {
      id:                  r.id,
      client_name,
      client_phone:        c?.phone_number ?? '',
      scheduled_at:        r.scheduled_at,
      status:              r.status,
      notification_failed: rems.some((rem) => rem.status === 'failed'),
      reminders_sent:      rems.length,
    }
  })
}
