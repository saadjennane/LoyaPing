/**
 * Analytics — global PostHog tracking.
 *
 * This module covers cross-cutting events that span the entire product lifecycle:
 * acquisition, onboarding, module adoption, global notification volume, billing.
 *
 * Module-specific events live in their own namespace (orders.ts, etc.).
 * All functions are fire-and-forget — they never throw or block.
 *
 * Event naming convention: <domain>_<action>  (snake_case)
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ EVENTS                         DOMAIN                   │
 * ├─────────────────────────────────────────────────────────┤
 * │ account_created                Acquisition              │
 * │ onboarding_completed           Activation               │
 * │ module_enabled                 Adoption                 │
 * │ notification_sent              Engagement (global)      │
 * │ orders_reminder_settings_updated  Configuration         │
 * │ billing_subscription_started   Monetization             │
 * │ billing_subscription_upgraded  Monetization             │
 * │ billing_subscription_canceled  Monetization / Churn     │
 * │ billing_credits_purchased      Monetization             │
 * └─────────────────────────────────────────────────────────┘
 */

import { capture } from './server'
import { getAccountContext } from './context'

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

export type ModuleName = 'orders' | 'appointments' | 'loyalty' | 'reviews'

export type NotificationSentProps = {
  module_name:      ModuleName
  reminder_number:  number | null  // 0 = first send, 1–3 = reminders, null = N/A
  estimated_message_cost: number | null  // USD, set when provider cost is known
}

export type BillingProps = {
  plan:     string
  amount:   number
  currency: string
}

// ─────────────────────────────────────────────────────────
// Public Analytics namespace
// ─────────────────────────────────────────────────────────

export const Analytics = {

  // ── Acquisition ──────────────────────────────────────────

  /**
   * Fired once when a new account starts onboarding for the first time.
   * Hook: onboarding-status PATCH  not_started → in_progress
   */
  accountCreated(): void {
    track('account_created', {}).catch(() => {})
  },

  // ── Activation ───────────────────────────────────────────

  /**
   * Fired when the merchant completes onboarding (reaches step-7 and clicks Finaliser).
   * Hook: onboarding-status PATCH  * → completed
   */
  onboardingCompleted(): void {
    track('onboarding_completed', {}).catch(() => {})
  },

  // ── Adoption ─────────────────────────────────────────────

  /**
   * Fired each time a module is enabled (not on disable).
   * Fires once per module that transitions false → true.
   * Hook: PATCH /api/settings/modules
   */
  moduleEnabled(module_name: ModuleName): void {
    track('module_enabled', { module_name }).catch(() => {})
  },

  // ── Engagement (global, cross-module) ────────────────────

  /**
   * Global notification counter — fires for every WhatsApp message sent.
   * Use this for total volume / cost / engagement metrics across all modules.
   * Module-specific events (orders_notification_sent, etc.) fire in parallel
   * for detailed per-module analysis.
   * Hook: called from each module's notificationSent function.
   */
  notificationSent(props: NotificationSentProps): void {
    track('notification_sent', props).catch(() => {})
  },

  // ── Configuration ─────────────────────────────────────────

  /**
   * Fired when the merchant saves their order reminder configuration.
   * Allows segmentation by how many reminders businesses configure.
   * Hook: PATCH /api/settings/order-notifications
   */
  ordersReminderSettingsUpdated(props: { reminders_configured: number }): void {
    track('orders_reminder_settings_updated', props).catch(() => {})
  },

  // ── Billing ───────────────────────────────────────────────
  // These are stubs — wire them when the billing system is implemented.

  billingSubscriptionStarted(props: BillingProps): void {
    track('billing_subscription_started', props).catch(() => {})
  },

  billingSubscriptionUpgraded(props: BillingProps): void {
    track('billing_subscription_upgraded', props).catch(() => {})
  },

  billingSubscriptionCanceled(props: BillingProps): void {
    track('billing_subscription_canceled', props).catch(() => {})
  },

  billingCreditsPurchased(props: BillingProps): void {
    track('billing_credits_purchased', props).catch(() => {})
  },
}
