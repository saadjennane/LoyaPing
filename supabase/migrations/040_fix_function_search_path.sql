-- ─── 040 : Fix mutable search_path on SQL/PLpgSQL functions ──────────────────
--
-- Adding SET search_path = '' prevents search_path injection attacks.
-- All table references inside functions are fully schema-qualified (public.*).

-- ── 1. claim_due_scheduled_messages ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_messages(
  p_batch_size  INT,
  p_claim_token UUID
)
RETURNS SETOF public.scheduled_messages
LANGUAGE sql
SET search_path = ''
AS $$
  WITH to_claim AS (
    SELECT id
    FROM   public.scheduled_messages
    WHERE  status  = 'SCHEDULED'
      AND  send_at <= now()
    ORDER  BY send_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.scheduled_messages sm
  SET
    status      = 'PROCESSING',
    claim_token = p_claim_token,
    claimed_at  = now(),
    updated_at  = now()
  FROM to_claim
  WHERE sm.id = to_claim.id
  RETURNING sm.*;
$$;

-- ── 2. claim_scheduled_message_now ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_scheduled_message_now(
  p_id          UUID,
  p_claim_token UUID
)
RETURNS SETOF public.scheduled_messages
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.scheduled_messages
  SET
    status      = 'PROCESSING',
    claim_token = p_claim_token,
    claimed_at  = now(),
    updated_at  = now()
  WHERE id     = p_id
    AND status = 'SCHEDULED'
  RETURNING *;
$$;

-- ── 3. lp_cancel_appointment_reminders ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lp_cancel_appointment_reminders(
  p_appointment_id UUID
)
RETURNS INT
LANGUAGE sql
SET search_path = ''
AS $$
  WITH cancelled AS (
    UPDATE public.scheduled_messages
    SET
      status       = 'CANCELLED',
      cancelled_at = now(),
      updated_at   = now()
    WHERE entity_type = 'appointment'
      AND entity_id   = p_appointment_id
      AND status      = 'SCHEDULED'
      AND send_at     > now()
    RETURNING id
  )
  SELECT count(*)::INT FROM cancelled;
$$;

-- ── 4. lp_legacy_write_guard ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lp_legacy_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'Writes to legacy table "%" are disabled (migration 032). '
    'This table is deprecated since the outbox refactor. '
    'Use the scheduled_messages outbox pattern instead.',
    TG_TABLE_NAME;
END;
$$;
