-- LoyaPing Phase 1 - Track WhatsApp messages sent per order
CREATE TABLE order_messages (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('ready_notification')),
  status     TEXT    NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_messages_order_id ON order_messages(order_id);
