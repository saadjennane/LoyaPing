/**
 * Reviews analytics — PostHog event tracking.
 *
 * Events:
 *   review_request_sent        — WhatsApp review request sent to a client
 *   review_positive_clicked    — client tapped the positive response (satisfied)
 *   review_negative_clicked    — client tapped the negative response (unsatisfied)
 *   review_redirect_to_google  — client was redirected to the Google review form
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

export type ReviewRequestSentProps = {
  client_id:                         string
  related_order_or_appointment_id:   string | null
  estimated_message_cost:            number | null
}

export type ReviewClientActionProps = {
  client_id: string
}

// ─────────────────────────────────────────────────────────
// Public Reviews namespace
// ─────────────────────────────────────────────────────────

export const Reviews = {
  /**
   * Fired when a WhatsApp review request is sent to a client.
   * Also fires the global notification_sent event.
   */
  requestSent(props: ReviewRequestSentProps): void {
    track('review_request_sent', props).catch(() => {})
    Analytics.notificationSent({
      module_name:            'reviews',
      reminder_number:        null,
      estimated_message_cost: props.estimated_message_cost,
    })
  },

  /**
   * Fired when a client taps the positive feedback link in the WhatsApp message.
   */
  positiveClicked(props: ReviewClientActionProps): void {
    track('review_positive_clicked', props).catch(() => {})
  },

  /**
   * Fired when a client taps the negative feedback link.
   */
  negativeClicked(props: ReviewClientActionProps): void {
    track('review_negative_clicked', props).catch(() => {})
  },

  /**
   * Fired when a satisfied client is redirected to the Google review form.
   */
  redirectToGoogle(props: ReviewClientActionProps): void {
    track('review_redirect_to_google', props).catch(() => {})
  },
}
