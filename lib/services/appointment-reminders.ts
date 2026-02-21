/**
 * Appointment reminder scheduling — Outbox pattern.
 *
 * Reminders are written into scheduled_messages at creation/update time.
 * The universal dispatch cron (/api/jobs/dispatch-scheduled-messages) sends them.
 * No appointment table scanning happens in the cron anymore.
 *
 * Flow:
 *   appointment created     → scheduleAppointmentReminders()
 *   appointment rescheduled → scheduleAppointmentReminders()  (cancels old first)
 *   appointment deleted     → cancelAppointmentReminders()
 */

import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID =
  process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// Stable message_type values — must stay in sync with the unique partial index
// idx_sm_active_unique ON (entity_type, entity_id, message_type)
// WHERE status IN ('SCHEDULED','PROCESSING').
// Index-based names keep them agnostic of the configured delay amount.
const REMINDER_MESSAGE_TYPES = [
  'appointment_reminder_1',
  'appointment_reminder_2',
  'appointment_reminder_3',
] as const

type ReminderMessageType = (typeof REMINDER_MESSAGE_TYPES)[number]
void REMINDER_MESSAGE_TYPES // suppress unused warning

// ── Internal: timezone-aware local time → UTC conversion ─────────────────────

/**
 * Given a reference UTC date and a "HH:mm" local time in a specific timezone,
 * returns the UTC instant that corresponds to that local time on the same
 * calendar day as `referenceDay` (as seen in `timezone`).
 *
 * Algorithm: construct a naive UTC candidate, measure the actual local offset
 * at that candidate, then correct by the difference. One-pass; DST-safe for
 * typical reminder windows (±30 min accuracy in edge cases is acceptable).
 */
function localHHmmToUTC(referenceDay: Date, hhMm: string, timezone: string): Date {
  const [hh, mm] = hhMm.split(':').map(Number)

  // Get the calendar date (YYYY-MM-DD) in the business timezone for referenceDay.
  // 'en-CA' locale produces ISO-style "YYYY-MM-DD" format.
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(referenceDay)

  // Treat "local date HH:mm" as if it were UTC — first approximation.
  const naive = new Date(
    `${localDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
  )

  // What local hour/minute does `naive` actually represent in the timezone?
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(naive)

  const localH = Number(parts.find(p => p.type === 'hour')!.value)
  const localM = Number(parts.find(p => p.type === 'minute')!.value)

  // Shift naive by the difference between desired and actual local time.
  const targetMs = (hh * 60 + mm) * 60_000
  const actualMs = (localH * 60 + localM) * 60_000

  return new Date(naive.getTime() + (targetMs - actualMs))
}

// ── Internal: compute send_at ─────────────────────────────────────────────────

function computeSendAt(
  apptDate:      Date,
  amount:        number,
  unit:          'minutes' | 'hours' | 'days',
  fixedSendTime: string | null, // "HH:mm" in business timezone, only used when unit === 'days'
  timezone:      string,
): Date {
  // Fixed-time mode: send at a specific HH:mm (business local time) on the Nth
  // day before the appointment.
  if (unit === 'days' && fixedSendTime) {
    const dayBefore = new Date(apptDate)
    dayBefore.setUTCDate(dayBefore.getUTCDate() - amount)
    return localHHmmToUTC(dayBefore, fixedSendTime, timezone)
  }

  // Duration-before mode: subtract the interval directly from the appointment time.
  const msPerUnit: Record<string, number> = {
    minutes: 60_000,
    hours:   3_600_000,
    days:    86_400_000,
  }
  const offsetMs = amount * (msPerUnit[unit] ?? 3_600_000)
  return new Date(apptDate.getTime() - offsetMs)
}

// ── cancelAppointmentReminders ────────────────────────────────────────────────

/**
 * Atomically cancels all future SCHEDULED outbox entries for an appointment.
 * Delegates to the lp_cancel_appointment_reminders Postgres function (migration 025)
 * which runs a single guarded UPDATE — no SELECT-then-UPDATE race.
 *
 * Returns the count of cancelled rows.
 */
export async function cancelAppointmentReminders(
  appointmentId: string,
): Promise<number> {
  const db = createServerClient()

  const { data, error } = await db.rpc('lp_cancel_appointment_reminders', {
    p_appointment_id: appointmentId,
  })

  if (error) throw new Error(`cancelAppointmentReminders: ${error.message}`)
  return (data as number) ?? 0
}

// ── scheduleAppointmentReminders ──────────────────────────────────────────────

/**
 * Computes and persists reminder outbox records for an appointment.
 *
 * Steps:
 *   1. Fetch the appointment row + client phone number.
 *   2. Guard: skip if appointment is not 'scheduled' or is soft-deleted.
 *   3. Read reminder config from appointment_notification_settings.
 *   4. Cancel any existing SCHEDULED reminders (atomic RPC).
 *   5. Compute send_at for each enabled reminder — skip past-due ones.
 *   6. Insert future reminders into scheduled_messages.
 *
 * Returns the IDs of the newly created scheduled_message rows.
 * Returns [] silently when nothing is scheduled (inactive appointment,
 * no settings, all reminders in the past, etc.).
 */
export async function scheduleAppointmentReminders(
  appointmentId: string,
): Promise<string[]> {
  const db = createServerClient()

  // ── 1. Fetch appointment + client phone ─────────────────────────────────
  const { data: appt, error: apptErr } = await db
    .from('appointments')
    .select('id, scheduled_at, status, deleted_at, client:clients(phone_number)')
    .eq('id', appointmentId)
    .single()

  if (apptErr || !appt) return []

  // ── 2. Guard: only schedule for active future appointments ───────────────
  if (appt.status !== 'scheduled' || appt.deleted_at) return []

  // Supabase may return the joined row as an object or a single-element array.
  const clientRaw = appt.client as
    | { phone_number: string }
    | Array<{ phone_number: string }>
    | null
  const phone = Array.isArray(clientRaw)
    ? clientRaw[0]?.phone_number
    : clientRaw?.phone_number

  if (!phone) return []

  // ── 3. Read reminder config + business timezone ──────────────────────────
  const { data: profileRow } = await db
    .from('business_profile')
    .select('timezone')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .maybeSingle()

  const businessTimezone: string =
    (profileRow as { timezone?: string } | null)?.timezone ?? 'Africa/Casablanca'

  type RawSettings = {
    reminder1_enabled: boolean; reminder1_delay_value: number; reminder1_delay_unit: string; reminder1_fixed_send_time: string | null; reminder1_message: string
    reminder2_enabled: boolean; reminder2_delay_value: number; reminder2_delay_unit: string; reminder2_fixed_send_time: string | null; reminder2_message: string
    reminder3_enabled: boolean; reminder3_delay_value: number; reminder3_delay_unit: string; reminder3_fixed_send_time: string | null; reminder3_message: string
  }

  const { data: rawSettings } = await db
    .from('appointment_notification_settings')
    .select(
      'reminder1_enabled, reminder1_delay_value, reminder1_delay_unit, reminder1_fixed_send_time, reminder1_message,' +
      'reminder2_enabled, reminder2_delay_value, reminder2_delay_unit, reminder2_fixed_send_time, reminder2_message,' +
      'reminder3_enabled, reminder3_delay_value, reminder3_delay_unit, reminder3_fixed_send_time, reminder3_message',
    )
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .maybeSingle()

  const settings = rawSettings as unknown as RawSettings | null
  if (!settings) return []

  type ReminderCfg = {
    messageType: ReminderMessageType
    enabled:     boolean
    amount:      number
    unit:        'minutes' | 'hours' | 'days'
    fixedTime:   string | null
    message:     string
  }


  const cfgs: ReminderCfg[] = [
    {
      messageType: 'appointment_reminder_1',
      enabled:   Boolean(settings.reminder1_enabled),
      amount:    Number(settings.reminder1_delay_value)  || 24,
      unit:      (settings.reminder1_delay_unit  ?? 'hours')   as ReminderCfg['unit'],
      fixedTime: settings.reminder1_fixed_send_time ?? null,
      message:   String(settings.reminder1_message  ?? '').trim(),
    },
    {
      messageType: 'appointment_reminder_2',
      enabled:   Boolean(settings.reminder2_enabled),
      amount:    Number(settings.reminder2_delay_value)  || 2,
      unit:      (settings.reminder2_delay_unit  ?? 'hours')   as ReminderCfg['unit'],
      fixedTime: settings.reminder2_fixed_send_time ?? null,
      message:   String(settings.reminder2_message  ?? '').trim(),
    },
    {
      messageType: 'appointment_reminder_3',
      enabled:   Boolean(settings.reminder3_enabled),
      amount:    Number(settings.reminder3_delay_value)  || 30,
      unit:      (settings.reminder3_delay_unit  ?? 'minutes') as ReminderCfg['unit'],
      fixedTime: settings.reminder3_fixed_send_time ?? null,
      message:   String(settings.reminder3_message  ?? '').trim(),
    },
  ]

  // ── 4. Cancel existing SCHEDULED reminders atomically (RPC) ─────────────
  // Must happen before insert to keep the unique partial index satisfied.
  await cancelAppointmentReminders(appointmentId)

  // ── 5. Compute send_at; filter out past-due reminders ───────────────────
  const apptDate = new Date(appt.scheduled_at as string)
  const now = new Date()

  const rows = cfgs
    .filter((c) => c.enabled && c.message)
    .map((c) => ({
      entity_type:  'appointment',
      entity_id:    appointmentId,
      message_type: c.messageType,
      to_whatsapp:  phone,
      body:         c.message,
      send_at:      computeSendAt(apptDate, c.amount, c.unit, c.fixedTime, businessTimezone).toISOString(),
    }))
    // Drop any reminders whose send time is already in the past.
    // (e.g. creating an appointment 1 hour before a 24h reminder would be due)
    .filter((r) => new Date(r.send_at) > now)

  if (rows.length === 0) return []

  // ── 6. Insert into scheduled_messages ───────────────────────────────────
  const { data: inserted, error: insertErr } = await db
    .from('scheduled_messages')
    .insert(rows)
    .select('id')

  if (insertErr) {
    // Unique partial index violation (23505): a reminder for this (appointment,
    // message_type) is still in PROCESSING status — the in-flight send will
    // deliver the message. Log and move on rather than crashing the request.
    if (insertErr.code === '23505') {
      console.warn(
        `[appointment-reminders] Unique conflict for appt ${appointmentId}:`,
        insertErr.message,
      )
      return []
    }
    throw new Error(`scheduleAppointmentReminders insert: ${insertErr.message}`)
  }

  return (inserted ?? []).map((r) => r.id as string)
}

// ── Backward-compat aliases ───────────────────────────────────────────────────
// Existing route handlers use these old names — they still work unchanged.

/**
 * @deprecated Use scheduleAppointmentReminders(appointmentId).
 *             The businessId parameter is now read from env internally.
 */
export const scheduleRemindersForAppointment = (
  appointmentId: string,
  _businessId:   string,
): Promise<string[]> => scheduleAppointmentReminders(appointmentId)

/**
 * @deprecated Use cancelAppointmentReminders(appointmentId).
 */
export const cancelPendingReminders = cancelAppointmentReminders
