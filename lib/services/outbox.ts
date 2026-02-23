/**
 * Outbox service — scheduled_messages table
 *
 * All WhatsApp notifications go through this table.
 * Status lifecycle: SCHEDULED → PROCESSING → SENT | FAILED | CANCELLED
 *
 * Anti-duplication guarantee:
 *   - Unique partial index on (entity_type, entity_id, message_type)
 *     WHERE status IN ('SCHEDULED','PROCESSING') prevents two active
 *     entries for the same logical slot.
 *   - Callers must call cancelExistingScheduledForEntity() before
 *     inserting a new message for the same slot.
 *   - Worker uses FOR UPDATE SKIP LOCKED (via Postgres function) so
 *     concurrent cron runs cannot claim the same row.
 */

import { createServerClient } from '@/lib/supabase/server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScheduledStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED'

export type ScheduledMessage = {
  id:            string
  entity_type:   string
  entity_id:     string
  message_type:  string
  to_whatsapp:   string
  body:          string
  send_at:       string
  status:        ScheduledStatus
  claim_token:   string | null
  claimed_at:    string | null
  attempts:      number
  last_error:    string | null
  sent_at:       string | null
  cancelled_at:  string | null
  created_at:    string
  updated_at:    string
}

// Max send attempts before a message is permanently marked FAILED.
// 4 = 1 initial attempt + 3 retries at 30 s / 60 s / 90 s backoff.
const MAX_ATTEMPTS = 4

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Persist a new outbox record.
 *
 * Throws if the unique partial index is violated (i.e. a SCHEDULED or
 * PROCESSING message already exists for this slot). Callers should
 * call cancelExistingScheduledForEntity() first to avoid this.
 */
export async function createScheduledMessage(params: {
  entityType:  string
  entityId:    string
  messageType: string
  to:          string
  body:        string
  sendAt:      Date
}): Promise<ScheduledMessage> {
  const db = createServerClient()

  const { data, error } = await db
    .from('scheduled_messages')
    .insert({
      entity_type:  params.entityType,
      entity_id:    params.entityId,
      message_type: params.messageType,
      to_whatsapp:  params.to,
      body:         params.body,
      send_at:      params.sendAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Surface unique constraint violations clearly so callers can return 409.
    if (error.code === '23505') {
      throw Object.assign(
        new Error('An active notification already exists for this slot'),
        { code: 'OUTBOX_CONFLICT' },
      )
    }
    throw new Error(`createScheduledMessage: ${error.message}`)
  }

  return data as ScheduledMessage
}

// ── Cancel single message ─────────────────────────────────────────────────────

/**
 * Cancels a single message only if it is still SCHEDULED.
 * Returns { cancelled: true } on success, { cancelled: false } if the
 * message was already claimed/sent/cancelled (caller should return 409).
 */
export async function cancelScheduledMessage(
  id: string,
): Promise<{ cancelled: boolean }> {
  const db = createServerClient()

  const { data, error } = await db
    .from('scheduled_messages')
    .update({
      status:       'CANCELLED',
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id',     id)
    .eq('status', 'SCHEDULED')   // Guard: only cancel if still queued
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`cancelScheduledMessage: ${error.message}`)
  return { cancelled: !!data }
}

// ── Cancel existing SCHEDULED messages for an entity ─────────────────────────

/**
 * Cancels all SCHEDULED (not PROCESSING) messages for a given entity slot.
 * Call this before inserting a new message for the same slot to ensure
 * only one active entry exists.
 *
 * Returns the count of cancelled rows.
 */
export async function cancelExistingScheduledForEntity(
  entityType:  string,
  entityId:    string,
  messageType: string,
): Promise<number> {
  const db = createServerClient()

  const { data, error } = await db
    .from('scheduled_messages')
    .update({
      status:       'CANCELLED',
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('entity_type',  entityType)
    .eq('entity_id',    entityId)
    .eq('message_type', messageType)
    .eq('status',       'SCHEDULED')
    .select('id')

  if (error) throw new Error(`cancelExistingScheduledForEntity: ${error.message}`)
  return data?.length ?? 0
}

// ── Atomic batch claim (cron worker) ─────────────────────────────────────────

/**
 * Atomically claims up to `batchSize` due messages using
 * FOR UPDATE SKIP LOCKED. Safe to call from concurrent cron runs —
 * each invocation will claim a disjoint set of rows.
 *
 * @param batchSize    Max rows to claim in one call.
 * @param claimToken   UUID identifying this worker invocation.
 */
export async function claimDueMessages(
  batchSize:  number,
  claimToken: string,
): Promise<ScheduledMessage[]> {
  const db = createServerClient()

  const { data, error } = await db.rpc('claim_due_scheduled_messages', {
    p_batch_size:  batchSize,
    p_claim_token: claimToken,
  })

  if (error) throw new Error(`claimDueMessages: ${error.message}`)
  return (data ?? []) as ScheduledMessage[]
}

// ── Atomic single claim (send-now) ────────────────────────────────────────────

/**
 * Attempts to atomically claim a single message for immediate dispatch.
 * Returns the message if it was SCHEDULED, or null if already
 * PROCESSING / SENT / CANCELLED (caller should return 409).
 */
export async function claimMessageNow(
  id:         string,
  claimToken: string,
): Promise<ScheduledMessage | null> {
  const db = createServerClient()

  const { data, error } = await db.rpc('claim_scheduled_message_now', {
    p_id:          id,
    p_claim_token: claimToken,
  })

  if (error) throw new Error(`claimMessageNow: ${error.message}`)

  // RPC returns SETOF (array); 0 rows = couldn't claim
  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows.length > 0 ? (rows[0] as ScheduledMessage) : null
}

// ── Mark SENT ─────────────────────────────────────────────────────────────────

/**
 * Marks a PROCESSING message as SENT.
 * The claim_token check ensures only the worker that claimed it
 * can mark it sent (prevents races if a stale cron run retries).
 */
export async function markSent(id: string, claimToken: string): Promise<void> {
  const db = createServerClient()

  const { error } = await db
    .from('scheduled_messages')
    .update({
      status:     'SENT',
      sent_at:    new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id',          id)
    .eq('claim_token', claimToken)
    .eq('status',      'PROCESSING')

  if (error) throw new Error(`markSent: ${error.message}`)
}

// ── Mark FAILED (with retry logic) ───────────────────────────────────────────

/**
 * Handles a send failure:
 *   - attempts < MAX_ATTEMPTS → reset to SCHEDULED with exponential backoff
 *     so the cron can retry automatically.
 *   - attempts >= MAX_ATTEMPTS → permanently mark FAILED.
 *
 * Uses claim_token guard so only the owning worker can update the row.
 */
export async function markFailed(
  id:           string,
  claimToken:   string,
  errorMessage: string,
): Promise<void> {
  const db = createServerClient()

  // Read current attempt count while holding the claim.
  const { data: msg, error: fetchErr } = await db
    .from('scheduled_messages')
    .select('attempts')
    .eq('id',          id)
    .eq('claim_token', claimToken)
    .eq('status',      'PROCESSING')
    .single()

  if (fetchErr || !msg) {
    // Row was concurrently modified; nothing safe to do.
    console.error(`[outbox] markFailed: row ${id} not found or not PROCESSING`)
    return
  }

  const attempts = (msg.attempts as number) + 1

  if (attempts < MAX_ATTEMPTS) {
    // Exponential backoff: 30s, 60s, 90s …
    const backoffMs = attempts * 30_000

    const { error } = await db
      .from('scheduled_messages')
      .update({
        status:      'SCHEDULED',   // Re-queue for cron retry
        claim_token: null,
        claimed_at:  null,
        last_error:  errorMessage,
        attempts,
        send_at:     new Date(Date.now() + backoffMs).toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id',          id)
      .eq('claim_token', claimToken)
      .eq('status',      'PROCESSING')

    if (error) throw new Error(`markFailed (retry): ${error.message}`)
  } else {
    // Exhausted — leave as FAILED so it's auditable.
    const { error } = await db
      .from('scheduled_messages')
      .update({
        status:     'FAILED',
        last_error: errorMessage,
        attempts,
        updated_at: new Date().toISOString(),
      })
      .eq('id',          id)
      .eq('claim_token', claimToken)
      .eq('status',      'PROCESSING')

    if (error) throw new Error(`markFailed (exhausted): ${error.message}`)
  }
}
