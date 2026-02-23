/**
 * Birthday rewards service
 *
 * Called once daily by GET /api/jobs/birthday-rewards (cron at 00:00 UTC).
 *
 * For each client whose birthday matches today's MM-DD **in the business
 * timezone** (not UTC):
 *   1. Atomically claim a birthday_sends row (UNIQUE constraint prevents
 *      any race condition or double-processing across concurrent runs).
 *   2. Create a birthday coupon if one doesn't exist for this year.
 *   3. Queue a WhatsApp message in scheduled_messages with
 *      send_at = today at birthday_send_hour **local time**, converted to UTC.
 *      The dispatch-scheduled-messages worker fires it at the right hour
 *      with up to 3 automatic retries on failure.
 *   4. Link the outbox entry back to birthday_sends.scheduled_message_id.
 *
 * Crash recovery:
 *   If the job crashes between coupon creation and message scheduling,
 *   birthday_sends.scheduled_message_id remains NULL. On the next manual
 *   re-run, the job detects this and retries only the message scheduling
 *   (coupon dedup prevents a second coupon).
 *
 * Timezone:
 *   "Today" and send_at are computed in business_profile.timezone (IANA).
 *   birthday_send_hour is interpreted as a local hour in that timezone,
 *   not UTC. DST-safe via iterative Intl.DateTimeFormat correction.
 */

import { createServerClient } from '@/lib/supabase/server'
import {
  createScheduledMessage,
  cancelExistingScheduledForEntity,
} from './outbox'

const DEFAULT_BUSINESS_ID =
  process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const BIRTHDAY_COUPON_VALIDITY_DAYS = 30

// ── Timezone helpers ──────────────────────────────────────────────────────────

/**
 * Returns 'YYYY-MM-DD' for the current moment in the given IANA timezone.
 * Uses en-CA locale which formats as YYYY-MM-DD natively.
 */
function getLocalDateInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(new Date())
}

/**
 * Converts "localDateStr at localHour:00:00 in tz" to a UTC Date.
 *
 * Algorithm: start with a naive UTC candidate (treating localHour as UTC),
 * then correct by measuring the actual local hour in the target timezone.
 * Two iterations handle half-hour offsets (e.g. India UTC+5:30) and
 * DST transitions reliably.
 */
function toUTCDate(localDateStr: string, localHour: number, tz: string): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  let candidate = new Date(`${localDateStr}T${pad(localHour)}:00:00Z`)
  for (let i = 0; i < 2; i++) {
    const h = parseInt(
      new Intl.DateTimeFormat('en', {
        timeZone: tz,
        hour:     'numeric',
        hour12:   false,
      }).format(candidate),
      10,
    )
    candidate = new Date(candidate.getTime() + (localHour - h) * 3_600_000)
  }
  return candidate
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

  // ── 2. Business timezone ───────────────────────────────────────────────────
  const { data: profile } = await db
    .from('business_profile')
    .select('timezone')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .maybeSingle()

  const tz = (profile?.timezone as string | null) ?? 'Africa/Casablanca'

  // ── 3. Today in business local time ───────────────────────────────────────
  const localDate  = getLocalDateInTz(tz)               // 'YYYY-MM-DD'
  const localYear  = parseInt(localDate.substring(0, 4))
  const localMMDD  = localDate.substring(5)             // 'MM-DD'
  const yearStart  = `${localYear}-01-01T00:00:00Z`

  const sendHour = (birthday_send_hour as number | null) ?? 9
  // send_at = today at sendHour:00 local time → UTC
  const sendAt   = toUTCDate(localDate, sendHour, tz)

  // ── 4. Clients with birthday today — SQL filter, no JS iteration ──────────
  //
  // birthday_mmdd is a STORED generated column: to_char(birthday, 'MM-DD').
  // The composite index idx_clients_birthday_mmdd(business_id, birthday_mmdd)
  // makes this a single index scan regardless of total client count.
  const { data: todayBirthdays, error: clientsErr } = await db
    .from('clients')
    .select('id, phone_number')
    .eq('business_id',   DEFAULT_BUSINESS_ID)
    .eq('birthday_mmdd', localMMDD)          // 'MM-DD', e.g. '02-23'

  if (clientsErr || !todayBirthdays) {
    return { processed: 0, sent: 0, skipped: 0, errors: 1 }
  }

  if (todayBirthdays.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  let sent = 0, skipped = 0, errors = 0

  for (const client of todayBirthdays) {
    try {
      // ── 5a. Atomic dedup — INSERT birthday_sends ───────────────────────
      //
      // UNIQUE(business_id, client_id, year) at DB level means this INSERT
      // is the single source of truth for "already processed this year".
      // No SELECT+INSERT race condition possible.
      let sendRecordId: string
      let isRecovery = false

      const { data: inserted, error: insertErr } = await db
        .from('birthday_sends')
        .insert({
          business_id: DEFAULT_BUSINESS_ID,
          client_id:   client.id,
          year:        localYear,
          send_hour:   sendHour,
          timezone:    tz,
          status:      'SCHEDULED',
        })
        .select('id')
        .single()

      if (insertErr) {
        if (insertErr.code !== '23505') {
          // Unexpected DB error
          console.error(`[birthday-rewards] birthday_sends insert failed for ${client.id}:`, insertErr)
          errors++
          continue
        }

        // 23505 = unique violation → record already exists for this year.
        // Check if it's a crash-recovery case (message never scheduled).
        const { data: existing } = await db
          .from('birthday_sends')
          .select('id, scheduled_message_id')
          .eq('business_id', DEFAULT_BUSINESS_ID)
          .eq('client_id',   client.id)
          .eq('year',        localYear)
          .single()

        if (!existing) {
          // Should not happen — just inserted and found nothing
          errors++
          continue
        }

        if (existing.scheduled_message_id !== null) {
          // Fully processed (outbox entry exists) → skip
          skipped++
          continue
        }

        // Crash recovery: birthday_sends exists but message was never queued.
        // Re-enter the flow skipping coupon creation.
        sendRecordId = existing.id as string
        isRecovery   = true
      } else {
        sendRecordId = inserted!.id as string
      }

      // ── 5b. Create birthday coupon (skip on recovery — may already exist) ─
      if (!isRecovery) {
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
          // Coupon failed — delete birthday_sends so the next run retries fully
          await db.from('birthday_sends').delete().eq('id', sendRecordId)
          console.error(`[birthday-rewards] coupon insert failed for ${client.id}:`, couponErr)
          errors++
          continue
        }
      } else {
        // Recovery: ensure coupon exists (may not if crash was before coupon creation)
        const { data: existingCoupon } = await db
          .from('coupons')
          .select('id')
          .eq('client_id', client.id)
          .eq('source',    'birthday')
          .gte('created_at', yearStart)
          .maybeSingle()

        if (!existingCoupon) {
          const expiresAt = new Date()
          expiresAt.setDate(expiresAt.getDate() + BIRTHDAY_COUPON_VALIDITY_DAYS)
          await db.from('coupons').insert({
            client_id:  client.id,
            tier_id:    null,
            status:     'active',
            source:     'birthday',
            expires_at: expiresAt.toISOString(),
          })
        }
      }

      // ── 5c. Queue WhatsApp message via outbox ──────────────────────────
      if (birthday_message_enabled && birthday_message_template) {
        const rewardTitle = (birthday_reward_title as string | null) ?? 'un cadeau'
        const messageBody = (birthday_message_template as string)
          .replace(/#{cadeau}/g, rewardTitle)
          .replace(/#{reward}/g, rewardTitle)

        // Cancel any lingering SCHEDULED row (safe if cron re-runs today)
        await cancelExistingScheduledForEntity('client', client.id, 'birthday')

        const msg = await createScheduledMessage({
          entityType:  'client',
          entityId:    client.id,
          messageType: 'birthday',
          to:          client.phone_number,
          body:        messageBody,
          sendAt,
        })

        // ── 5d. Link outbox entry to birthday_sends ────────────────────
        // Once scheduled_message_id is set, this client is "fully processed"
        // and crash-recovery will skip them on any re-run.
        await db
          .from('birthday_sends')
          .update({ scheduled_message_id: msg.id })
          .eq('id', sendRecordId)
      } else {
        // Message disabled — mark as SKIPPED (coupon was still created)
        await db
          .from('birthday_sends')
          .update({ status: 'SKIPPED', scheduled_message_id: null })
          .eq('id', sendRecordId)
      }

      sent++
    } catch (err) {
      console.error(`[birthday-rewards] error for client ${client.id}:`, err)
      errors++
    }
  }

  return { processed: todayBirthdays.length, sent, skipped, errors }
}
