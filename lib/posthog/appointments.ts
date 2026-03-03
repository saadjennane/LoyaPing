/**
 * Appointments analytics — PostHog event tracking.
 *
 * Events:
 *   appointments_created              — new appointment booked
 *   appointments_reminder_sent        — WhatsApp reminder sent
 *   appointments_marked_completed     — appointment marked as showed
 *   appointments_marked_no_show       — appointment marked as no-show
 *
 * All functions are fire-and-forget.
 */

import { capture } from './server'
import { getAccountContext } from './context'
import { Analytics } from './analytics'

// ─────────────────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────────────────

async function track(event: string, props: Record<string, unknown>): Promise<void> {
  try {
    const ctx = await getAccountContext()
    capture(event, { ...ctx, ...props })
  } catch {
    // Analytics must never block or throw
  }
}

// ─────────────────────────────────────────────────────────
// Prop types
// ─────────────────────────────────────────────────────────

export type AppointmentCreatedProps = {
  appointment_id: string
  has_client:     boolean  // false = calendar import without assigned client
}

export type AppointmentReminderSentProps = {
  appointment_id:               string
  reminder_number:              1 | 2 | 3
  time_before_appointment_hours: number | null
  estimated_message_cost:       number | null
}

export type AppointmentCompletedProps = {
  appointment_id:           string
  completed_after_reminder: number  // 0 = completed with no reminder sent
  time_to_completion_minutes: number | null
}

export type AppointmentNoShowProps = {
  appointment_id:           string
  completed_after_reminder: number
}

// ─────────────────────────────────────────────────────────
// Public Appointments namespace
// ─────────────────────────────────────────────────────────

export const Appointments = {
  /**
   * Fired when a new appointment is created.
   */
  created(props: AppointmentCreatedProps): void {
    track('appointments_created', props).catch(() => {})
  },

  /**
   * Fired when a WhatsApp reminder is sent for an appointment.
   * Also fires the global notification_sent event.
   */
  reminderSent(props: AppointmentReminderSentProps): void {
    track('appointments_reminder_sent', props).catch(() => {})
    Analytics.notificationSent({
      module_name:            'appointments',
      reminder_number:        props.reminder_number,
      estimated_message_cost: props.estimated_message_cost,
    })
  },

  /**
   * Fired when an appointment is marked as completed (client showed up).
   */
  markedCompleted(props: AppointmentCompletedProps): void {
    track('appointments_marked_completed', props).catch(() => {})
  },

  /**
   * Fired when an appointment is marked as no-show.
   */
  markedNoShow(props: AppointmentNoShowProps): void {
    track('appointments_marked_no_show', props).catch(() => {})
  },
}
