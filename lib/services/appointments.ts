import { createServerClient } from '@/lib/supabase/server'
import { creditPoints } from '@/lib/services/loyalty'
import {
  cancelExistingScheduledForEntity,
  createScheduledMessage,
} from '@/lib/services/outbox'
import type { Appointment, AppointmentListItem, Client, LoyaltyProgram, ReminderStatus } from '@/lib/types'

// ── Reminder status — single batch query from scheduled_messages ──────────────

const APPT_REMINDER_TYPES = [
  'appointment_reminder_1',
  'appointment_reminder_2',
  'appointment_reminder_3',
] as const

/**
 * Fetches scheduled_messages rows for a batch of appointment IDs and
 * computes a ReminderStatus per appointment. One DB round-trip regardless
 * of how many appointments are in the list.
 */
async function fetchReminderStatuses(
  db: ReturnType<typeof createServerClient>,
  appointmentIds: string[],
): Promise<Map<string, ReminderStatus>> {
  if (appointmentIds.length === 0) return new Map()

  const { data } = await db
    .from('scheduled_messages')
    .select('entity_id, message_type, status, send_at, sent_at')
    .eq('entity_type', 'appointment')
    .in('entity_id', appointmentIds)
    .in('message_type', [...APPT_REMINDER_TYPES])

  type Row = {
    entity_id:    string
    message_type: string
    status:       string
    send_at:      string
    sent_at:      string | null
  }

  const rows = (data ?? []) as Row[]
  const now   = new Date().toISOString()

  // Group rows by appointment ID
  const byAppt = new Map<string, Row[]>()
  for (const row of rows) {
    const list = byAppt.get(row.entity_id) ?? []
    list.push(row)
    byAppt.set(row.entity_id, list)
  }

  const result = new Map<string, ReminderStatus>()

  for (const [apptId, apptRows] of byAppt) {
    const nextReminderAt =
      apptRows
        .filter((r) => r.status === 'SCHEDULED' && r.send_at > now)
        .sort((a, b) => a.send_at.localeCompare(b.send_at))[0]?.send_at ?? null

    const lastReminderSentAt =
      apptRows
        .filter((r) => r.status === 'SENT' && r.sent_at)
        .sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))[0]?.sent_at ?? null

    const isSlotActive = (mt: string) =>
      apptRows.some(
        (r) => r.message_type === mt &&
          (r.status === 'SCHEDULED' || r.status === 'PROCESSING' || r.status === 'SENT'),
      )

    result.set(apptId, {
      nextReminderAt,
      lastReminderSentAt,
      remindersScheduled: {
        r1: isSlotActive('appointment_reminder_1'),
        r2: isSlotActive('appointment_reminder_2'),
        r3: isSlotActive('appointment_reminder_3'),
      },
      hasFailed: apptRows.some((r) => r.status === 'FAILED'),
    })
  }

  return result
}

function emptyReminderStatus(): ReminderStatus {
  return {
    nextReminderAt:     null,
    lastReminderSentAt: null,
    remindersScheduled: { r1: false, r2: false, r3: false },
    hasFailed:          false,
  }
}

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
    .in('status', ['scheduled', 'no_show'])   // allow flip no_show → show
    .single()

  if (error || !appt) throw new Error('Appointment not found or already marked as show')

  const now = new Date().toISOString()

  // Points already credited on a previous show → just flip the status, skip re-crediting
  if (appt.points_credited) {
    await db
      .from('appointments')
      .update({ status: 'show', show_at: now, ...(amount !== undefined ? { amount } : {}) })
      .eq('id', appointmentId)
    return { ...(appt as Appointment), pointsCredited: 0 }
  }

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

  // Queue post-show WhatsApp message via outbox (retry-safe, auditable)
  try {
    const { data: notifSettings } = await db
      .from('appointment_notification_settings')
      .select('post_messages_enabled, post_show_message')
      .eq('business_id', appt.business_id)
      .maybeSingle()

    const phone = (appt.client as Client | undefined)?.phone_number
    if (phone && notifSettings?.post_messages_enabled && notifSettings?.post_show_message) {
      // Status flip: cancel any pending post_no_show from a previous no_show marking
      await cancelExistingScheduledForEntity('appointment', appointmentId, 'appointment_post_no_show')

      // Idempotency: skip if a post_show was already delivered
      const { data: sentRows } = await db
        .from('scheduled_messages')
        .select('id')
        .eq('entity_type',  'appointment')
        .eq('entity_id',    appointmentId)
        .eq('message_type', 'appointment_post_show')
        .eq('status',       'SENT')
        .limit(1)

      if (!(sentRows?.length)) {
        // Cancel any stale SCHEDULED post_show before re-enqueuing
        await cancelExistingScheduledForEntity('appointment', appointmentId, 'appointment_post_show')
        await createScheduledMessage({
          entityType:  'appointment',
          entityId:    appointmentId,
          messageType: 'appointment_post_show',
          to:          phone,
          body:        notifSettings.post_show_message,
          sendAt:      new Date(),
        })
      }
    }
  } catch (e) {
    console.error('[appointments] Failed to queue post-show message:', e)
  }

  return { ...(appt as Appointment), pointsCredited: pointsToCredit }
}

// =========================================
// MARK AS NO SHOW (no credit)
// =========================================
export async function markNoShow(appointmentId: string): Promise<void> {
  const db = createServerClient()

  // Fetch appointment before updating (need business_id + client phone).
  // Allowed source statuses: 'scheduled' and 'show' (normal flip show → no_show).
  const { data: appt } = await db
    .from('appointments')
    .select('business_id, client:clients(phone_number)')
    .eq('id', appointmentId)
    .in('status', ['scheduled', 'show'])
    .maybeSingle()

  const { error } = await db
    .from('appointments')
    .update({ status: 'no_show', no_show_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .in('status', ['scheduled', 'show'])

  if (error) throw error

  // Queue post-no-show WhatsApp message via outbox (retry-safe, auditable)
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
        // Status flip: cancel any pending post_show from a previous show marking
        await cancelExistingScheduledForEntity('appointment', appointmentId, 'appointment_post_show')

        // Idempotency: skip if a post_no_show was already delivered
        const { data: sentRows } = await db
          .from('scheduled_messages')
          .select('id')
          .eq('entity_type',  'appointment')
          .eq('entity_id',    appointmentId)
          .eq('message_type', 'appointment_post_no_show')
          .eq('status',       'SENT')
          .limit(1)

        if (!(sentRows?.length)) {
          // Cancel any stale SCHEDULED post_no_show before re-enqueuing
          await cancelExistingScheduledForEntity('appointment', appointmentId, 'appointment_post_no_show')
          await createScheduledMessage({
            entityType:  'appointment',
            entityId:    appointmentId,
            messageType: 'appointment_post_no_show',
            to:          phone,
            body:        notifSettings.post_no_show_message,
            sendAt:      new Date(),
          })
        }
      }
    } catch (e) {
      console.error('[appointments] Failed to queue post-no-show message:', e)
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
    .select('*, client:clients!left(id, civility, first_name, last_name, phone_number, magic_token)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as Appointment[]
  const reminderMap = await fetchReminderStatuses(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, reminderStatus: reminderMap.get(r.id) ?? emptyReminderStatus() }))
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
  statusFilter: 'all' | 'upcoming' | 'show' | 'no_show' | 'unassigned'
  notifFilter:  'all' | 'failed_only'
}): Promise<AppointmentListItem[]> {
  const db = createServerClient()

  const fromDt = new Date(params.from)
  fromDt.setUTCHours(0, 0, 0, 0)

  const toDt = new Date(params.to)
  toDt.setUTCHours(23, 59, 59, 999)

  let query = db
    .from('appointments')
    .select('id, client_id, scheduled_at, ended_at, status, notes, client:clients(civility, first_name, last_name, phone_number)')
    .eq('business_id', params.businessId)
    .is('deleted_at', null)
    .gte('scheduled_at', fromDt.toISOString())
    .lte('scheduled_at', toDt.toISOString())

  // 'upcoming' param = status='scheduled' in DB
  if (params.statusFilter === 'upcoming')      query = query.eq('status', 'scheduled')
  else if (params.statusFilter === 'show')     query = query.eq('status', 'show')
  else if (params.statusFilter === 'no_show')  query = query.eq('status', 'no_show')
  else if (params.statusFilter === 'unassigned') query = query.is('client_id', null)

  // upcoming mode → ASC, history → DESC
  query = query.order('scheduled_at', { ascending: params.mode === 'upcoming' })

  const { data, error } = await query
  if (error) throw error

  type Row = {
    id: string
    client_id: string | null
    scheduled_at: string
    ended_at: string | null
    status: 'scheduled' | 'show' | 'no_show'
    notes: string | null
    client: { civility: string | null; first_name: string | null; last_name: string | null; phone_number: string } | null
  }

  const rows = (data ?? []) as unknown as Row[]

  // Fetch reminder statuses for the full result set in one query.
  const reminderMap = await fetchReminderStatuses(db, rows.map((r) => r.id))

  // Apply notifFilter using scheduled_messages FAILED status (replaces legacy reminder_sends filter).
  const filtered = params.notifFilter === 'failed_only'
    ? rows.filter((r) => reminderMap.get(r.id)?.hasFailed ?? false)
    : rows

  return filtered.map((r) => {
    // PostgREST returns 1-to-1 joins as object (not array) — handle both defensively
    const c = Array.isArray(r.client) ? r.client[0] : r.client
    const nameParts = [c?.civility, c?.first_name, c?.last_name].filter(Boolean)
    const client_name = nameParts.length > 0 ? nameParts.join(' ') : (c?.phone_number ?? '—')
    return {
      id:             r.id,
      client_id:      r.client_id,
      client_name,
      client_phone:   c?.phone_number ?? '',
      scheduled_at:   r.scheduled_at,
      ended_at:       r.ended_at ?? null,
      status:         r.status,
      notes:          r.notes ?? null,
      reminderStatus: reminderMap.get(r.id) ?? emptyReminderStatus(),
    }
  })
}
