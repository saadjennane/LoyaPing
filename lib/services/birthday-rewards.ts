/**
 * Birthday rewards service
 *
 * Called once daily by GET /api/jobs/birthday-rewards (cron at 00:00 UTC).
 *
 * For each client whose birthday is today (MM-DD match in UTC):
 *   1. Create a birthday coupon (if not already created this year).
 *   2. Queue a WhatsApp message in scheduled_messages with
 *      send_at = today at loyalty_programs.birthday_send_hour UTC.
 *      The dispatch-scheduled-messages worker fires it at the right hour
 *      and retries up to 3 times on failure.
 *
 * Deduplication:
 *   - Coupon: checks coupons.source='birthday' created this calendar year.
 *   - Message: checks scheduled_messages for a SENT 'birthday' message this year;
 *     also calls cancelExistingScheduledForEntity before inserting so a cron
 *     re-run on the same day doesn't create a duplicate SCHEDULED row.
 */

import { createServerClient } from '@/lib/supabase/server'
import {
  createScheduledMessage,
  cancelExistingScheduledForEntity,
} from './outbox'

const DEFAULT_BUSINESS_ID =
  process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// Coupon validity for birthday rewards (30 days)
const BIRTHDAY_COUPON_VALIDITY_DAYS = 30

export async function processBirthdayRewards(): Promise<{
  processed: number
  sent:      number
  skipped:   number
  errors:    number
}> {
  const db = createServerClient()

  // ── 1. Program settings ────────────────────────────────────────────────────
  const { data: program, error: progErr } = await db
    .from('loyalty_programs')
    .select(
      'birthday_reward_enabled, birthday_reward_title, birthday_message_enabled, birthday_message_template, birthday_send_hour',
    )
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .maybeSingle()

  if (progErr || !program || !program.birthday_reward_enabled) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  const {
    birthday_reward_title,
    birthday_message_enabled,
    birthday_message_template,
    birthday_send_hour,
  } = program

  // ── 2. Today's date (UTC) ──────────────────────────────────────────────────
  const now      = new Date()
  const yyyy     = now.getUTCFullYear()
  const mm       = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd       = String(now.getUTCDate()).padStart(2, '0')
  const todayMMDD = `${mm}-${dd}`
  const yearStart = `${yyyy}-01-01T00:00:00Z`

  // send_at = today at birthday_send_hour UTC (default 9h UTC)
  const sendHour = (birthday_send_hour as number | null) ?? 9
  const sendAt   = new Date(Date.UTC(yyyy, now.getUTCMonth(), now.getUTCDate(), sendHour, 0, 0))

  // ── 3. Clients with birthday today ────────────────────────────────────────
  const { data: clients, error: clientsErr } = await db
    .from('clients')
    .select('id, phone_number, birthday')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .not('birthday', 'is', null)

  if (clientsErr || !clients) {
    return { processed: 0, sent: 0, skipped: 0, errors: 1 }
  }

  // birthday stored as YYYY-MM-DD; compare MM-DD part
  const todayBirthdays = clients.filter(
    (c) => c.birthday && (c.birthday as string).substring(5) === todayMMDD,
  )

  if (todayBirthdays.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  let sent = 0, skipped = 0, errors = 0

  for (const client of todayBirthdays) {
    try {
      // ── 4a. Coupon dedup: already rewarded this calendar year? ─────────
      const { data: existingCoupon } = await db
        .from('coupons')
        .select('id')
        .eq('client_id', client.id)
        .eq('source', 'birthday')
        .gte('created_at', yearStart)
        .maybeSingle()

      if (existingCoupon) {
        skipped++
        continue
      }

      // ── 4b. Create birthday coupon ─────────────────────────────────────
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + BIRTHDAY_COUPON_VALIDITY_DAYS)

      const { error: couponErr } = await db
        .from('coupons')
        .insert({
          client_id:  client.id,
          tier_id:    null,
          status:     'active',
          source:     'birthday',
          expires_at: expiresAt.toISOString(),
        })

      if (couponErr) {
        errors++
        continue
      }

      // ── 4c. Queue WhatsApp message via outbox ──────────────────────────
      if (birthday_message_enabled && birthday_message_template) {
        // Message dedup: skip if already SENT this year (e.g. cron re-run
        // after a successful send due to a schedule misconfiguration).
        const { data: alreadySent } = await db
          .from('scheduled_messages')
          .select('id')
          .eq('entity_type',  'client')
          .eq('entity_id',    client.id)
          .eq('message_type', 'birthday')
          .eq('status',       'SENT')
          .gte('created_at',  yearStart)
          .maybeSingle()

        if (!alreadySent) {
          const rewardTitle = (birthday_reward_title as string | null) ?? 'un cadeau'
          const messageBody = (birthday_message_template as string)
            .replace(/#{cadeau}/g, rewardTitle)
            .replace(/#{reward}/g, rewardTitle)

          // Cancel any lingering SCHEDULED row (safe if cron re-runs today)
          await cancelExistingScheduledForEntity('client', client.id, 'birthday')

          // Insert into outbox — dispatched by dispatch-scheduled-messages
          // at birthday_send_hour UTC with automatic retry on failure.
          await createScheduledMessage({
            entityType:  'client',
            entityId:    client.id,
            messageType: 'birthday',
            to:          client.phone_number,
            body:        messageBody,
            sendAt,
          })
        }
      }

      sent++
    } catch (err) {
      console.error(`[birthday-rewards] error for client ${client.id}:`, err)
      errors++
    }
  }

  return { processed: todayBirthdays.length, sent, skipped, errors }
}
