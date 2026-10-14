-- ─── 052 : Gift cards (cartes cadeaux) ──────────────────────────────────────
--
-- A gift card is sold to a buyer (client who offers) for a recipient (client
-- who receives) and covers one service (soin). It is "consumed" once the
-- recipient has had the service, optionally linked to that appointment.
-- Service name/price are snapshotted so that editing or deleting the catalog
-- never changes a sold card.

CREATE TABLE IF NOT EXISTS gift_cards (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID          NOT NULL,
  code                TEXT          NOT NULL,
  buyer_client_id     UUID          REFERENCES clients(id) ON DELETE SET NULL,
  recipient_client_id UUID          REFERENCES clients(id) ON DELETE SET NULL,
  service_id          UUID          REFERENCES services(id) ON DELETE SET NULL,
  service_name        TEXT          NOT NULL,
  service_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  notes               TEXT,
  sold_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  consumed_at         TIMESTAMPTZ,
  consumed_appointment_id UUID      REFERENCES appointments(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE INDEX IF NOT EXISTS gift_cards_business_idx
  ON gift_cards (business_id, sold_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS gift_cards_recipient_idx ON gift_cards (recipient_client_id);
CREATE INDEX IF NOT EXISTS gift_cards_buyer_idx     ON gift_cards (buyer_client_id);
CREATE INDEX IF NOT EXISTS gift_cards_appointment_idx ON gift_cards (consumed_appointment_id);

-- RLS — same pattern as 041/047 (service role bypasses, direct access denied)
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON public.gift_cards AS RESTRICTIVE USING (false);
