-- ============================================================
-- 024 — Outbox / scheduled_messages
-- Universal WhatsApp outbox table + atomic claim functions.
-- Replaces the ad-hoc order_scheduled_notifications pattern.
-- ============================================================

-- 1. Status enum
CREATE TYPE scheduled_status AS ENUM (
  'SCHEDULED',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

-- 2. Outbox table
CREATE TABLE scheduled_messages (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT              NOT NULL,                    -- e.g. 'order', 'appointment'
  entity_id     UUID              NOT NULL,
  message_type  TEXT              NOT NULL,                    -- e.g. 'order_ready', 'birthday'
  to_whatsapp   TEXT              NOT NULL,                    -- E.164 phone number
  body          TEXT              NOT NULL,
  send_at       TIMESTAMPTZ       NOT NULL,
  status        scheduled_status  NOT NULL DEFAULT 'SCHEDULED',
  claim_token   UUID              NULL,                        -- set when PROCESSING
  claimed_at    TIMESTAMPTZ       NULL,
  attempts      INT               NOT NULL DEFAULT 0,
  last_error    TEXT              NULL,
  sent_at       TIMESTAMPTZ       NULL,
  cancelled_at  TIMESTAMPTZ       NULL,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- 3. Standard indexes
CREATE INDEX idx_sm_status_send_at
  ON scheduled_messages (status, send_at);

CREATE INDEX idx_sm_entity
  ON scheduled_messages (entity_type, entity_id, message_type);

-- 4. Unique partial index — at most ONE active message per logical slot.
--    FAILED and CANCELLED rows do not block a new SCHEDULED insert.
CREATE UNIQUE INDEX idx_sm_active_unique
  ON scheduled_messages (entity_type, entity_id, message_type)
  WHERE status IN ('SCHEDULED', 'PROCESSING');

-- ============================================================
-- 5. Atomic batch claim (FOR UPDATE SKIP LOCKED)
--    Used by the cron worker to safely grab a batch of due
--    messages without races or double-sends across overlapping
--    cron invocations.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_due_scheduled_messages(
  p_batch_size  INT,
  p_claim_token UUID
)
RETURNS SETOF scheduled_messages
LANGUAGE sql
AS $$
  WITH to_claim AS (
    SELECT id
    FROM   scheduled_messages
    WHERE  status  = 'SCHEDULED'
      AND  send_at <= now()
    ORDER  BY send_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE scheduled_messages sm
  SET
    status      = 'PROCESSING',
    claim_token = p_claim_token,
    claimed_at  = now(),
    updated_at  = now()
  FROM to_claim
  WHERE sm.id = to_claim.id
  RETURNING sm.*;
$$;

-- ============================================================
-- 6. Atomic single-message claim (send-now flow)
--    Returns the row only if it was SCHEDULED (not yet claimed).
--    Returns empty set if already PROCESSING / SENT / CANCELLED.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_scheduled_message_now(
  p_id          UUID,
  p_claim_token UUID
)
RETURNS SETOF scheduled_messages
LANGUAGE sql
AS $$
  UPDATE scheduled_messages
  SET
    status      = 'PROCESSING',
    claim_token = p_claim_token,
    claimed_at  = now(),
    updated_at  = now()
  WHERE id     = p_id
    AND status = 'SCHEDULED'
  RETURNING *;
$$;
