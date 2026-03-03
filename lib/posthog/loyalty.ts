/**
 * Loyalty analytics — PostHog event tracking.
 *
 * Events:
 *   loyalty_points_added      — points credited to a client
 *   loyalty_reward_unlocked   — client crosses a reward threshold
 *   loyalty_reward_redeemed   — client uses a reward (coupon)
 *
 * All functions are fire-and-forget.
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

export type LoyaltyPointsAddedProps = {
  client_id:    string
  mode:         'passage' | 'montant'  // loyalty program type
  points_added: number
  order_amount: number | null          // null for visit-based programs
  source_type:  'order' | 'appointment' | 'manual'
}

export type LoyaltyRewardUnlockedProps = {
  client_id:  string
  reward_id:  string
  points_at_unlock: number
}

export type LoyaltyRewardRedeemedProps = {
  reward_id:       string
  days_since_unlock: number | null  // null if unlock_date unknown
}

// ─────────────────────────────────────────────────────────
// Public Loyalty namespace
// ─────────────────────────────────────────────────────────

export const Loyalty = {
  /**
   * Fired every time points are credited to a client.
   */
  pointsAdded(props: LoyaltyPointsAddedProps): void {
    track('loyalty_points_added', props).catch(() => {})
  },

  /**
   * Fired when a client's point balance crosses a reward threshold.
   */
  rewardUnlocked(props: LoyaltyRewardUnlockedProps): void {
    track('loyalty_reward_unlocked', props).catch(() => {})
  },

  /**
   * Fired when a client redeems (uses) a reward coupon.
   */
  rewardRedeemed(props: LoyaltyRewardRedeemedProps): void {
    track('loyalty_reward_redeemed', props).catch(() => {})
  },
}
