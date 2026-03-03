/**
 * Orders analytics — PostHog event tracking.
 *
 * All functions are fire-and-forget (never throw, never await at call site).
 * Context fields (account_id, industry, loyalty_mode, plan) are injected
 * automatically via getAccountContext().
 *
 * Convention: event names follow  orders_<action>  (snake_case).
 */

import { createServerClient } from '@/lib/supabase/server'
import { capture } from './server'
import { getAccountContext } from './context'
import { Analytics } from './analytics'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? 'unknown'

// ─────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────

async function track(event: string, props: Record<string, unknown>): Promise<void> {
  try {
    const ctx = await getAccountContext()
    capture(event, { ...ctx, ...props })
  } catch {
    // Analytics must never block or throw
  }
}

/** Returns the number of enabled reminders (0–3) from order_notification_settings. */
async function getRemindersConfigured(): Promise<number> {
  try {
    const db = createServerClient()
    const { data } = await db
      .from('order_notification_settings')
      .select('reminder1_enabled, reminder2_enabled, reminder3_enabled')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()
    if (!data) return 0
    return (
      (data.reminder1_enabled ? 1 : 0) +
      (data.reminder2_enabled ? 1 : 0) +
      (data.reminder3_enabled ? 1 : 0)
    )
  } catch {
    return 0
  }
}

// ─────────────────────────────────────────────────────────
// Event prop types
// ─────────────────────────────────────────────────────────

export type OrderCreatedProps = {
  order_id:             string
  has_amount:           boolean
  order_amount:         number
  completed_immediately: boolean
}

export type OrderReadyMarkedProps = {
  order_id: string
}

export type OrderCollectedProps = {
  order_id:                 string
  time_to_collect_minutes:  number | null  // null if ready_at missing
  total_messages_sent:      number         // ready + reminders
  collected_after_reminder: boolean
}

export type NotificationSentProps = {
  order_id:       string
  reminder_number: 0 | 1 | 2 | 3  // 0 = ready notification, 1–3 = reminders
  message_type:   'ready' | 'reminder'
}

export type NotificationFailedProps = {
  order_id:       string
  reminder_number: 0 | 1 | 2 | 3
  message_type:   'ready' | 'reminder'
  error:          string
}

// ─────────────────────────────────────────────────────────
// Public Orders namespace
// ─────────────────────────────────────────────────────────

export const Orders = {
  /**
   * Fired when a new order is created (POST /api/orders).
   * Fetches reminders_configured from DB automatically.
   */
  orderCreated(props: OrderCreatedProps): void {
    getRemindersConfigured()
      .then((reminders_configured) =>
        track('orders_order_created', { ...props, reminders_configured }),
      )
      .catch(() => {})
  },

  /**
   * Fired when a merchant marks an order as ready (PATCH /api/orders/:id/ready).
   */
  orderReadyMarked(props: OrderReadyMarkedProps): void {
    track('orders_order_ready_marked', props).catch(() => {})
  },

  /**
   * Fired when a client picks up their order (PATCH /api/orders/:id status=picked_up).
   */
  orderCollected(props: OrderCollectedProps): void {
    track('orders_order_collected', props).catch(() => {})
  },

  /**
   * Fired when a WhatsApp notification is successfully queued/sent.
   * reminder_number=0 → ready notification; 1–3 → scheduled reminders.
   * Also fires the global notification_sent event for cross-module metrics.
   */
  notificationSent(props: NotificationSentProps): void {
    track('orders_notification_sent', props).catch(() => {})
    Analytics.notificationSent({
      module_name:            'orders',
      reminder_number:        props.reminder_number,
      estimated_message_cost: null,
    })
  },

  /**
   * Fired when a WhatsApp notification fails (provider error or exception).
   */
  notificationFailed(props: NotificationFailedProps): void {
    track('orders_notification_failed', props).catch(() => {})
  },

  /**
   * Fired once when the orders module is enabled in settings.
   */
  moduleEnabled(): void {
    track('orders_module_enabled', {}).catch(() => {})
  },
}
