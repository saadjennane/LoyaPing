-- Migration 049: Conversations à traiter
--
-- Creates the conversation thread system for handling negative WhatsApp reviews.
-- When a client clicks "Non" on a satisfaction survey, a conversation is created
-- allowing the merchant to interact with the client directly via WhatsApp.

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  phone           TEXT        NOT NULL,
  entity_type     TEXT        CHECK (entity_type IN ('order', 'appointment')),
  entity_id       UUID,
  status          TEXT        NOT NULL DEFAULT 'TO_TREAT'
                              CHECK (status IN ('TO_TREAT', 'OPEN', 'IN_PROGRESS', 'RESOLVED')),
  last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one active (non-RESOLVED) conversation per phone per business
-- Allows multiple RESOLVED conversations over time but prevents duplicate open threads.
CREATE UNIQUE INDEX conversations_active_unique_idx
  ON conversations (business_id, phone)
  WHERE status != 'RESOLVED';

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_business_status_idx
  ON conversations (business_id, status, created_at DESC);

CREATE INDEX conversation_messages_conv_idx
  ON conversation_messages (conversation_id, created_at ASC);

ALTER TABLE conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all" ON conversations         AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON conversation_messages AS RESTRICTIVE USING (false);
