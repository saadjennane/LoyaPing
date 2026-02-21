-- =========================================
-- 017_ready_notification_delay.sql
-- Deferred Ready notification (10-second undo window)
-- =========================================

-- 1. Scheduled notifications table for READY messages
CREATE TABLE IF NOT EXISTS order_scheduled_notifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id    UUID        NOT NULL,
  type           TEXT        NOT NULL DEFAULT 'READY',
  status         TEXT        NOT NULL DEFAULT 'SCHEDULED',
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  meta           JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_scheduled_notifications_type_check
    CHECK (type IN ('READY', 'READY_CORRECTION')),
  CONSTRAINT order_scheduled_notifications_status_check
    CHECK (status IN ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_order_sched_notifs_status
  ON order_scheduled_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_order_sched_notifs_order_id
  ON order_scheduled_notifications(order_id);

-- 2. Add correction template to order_notification_settings
ALTER TABLE order_notification_settings
  ADD COLUMN IF NOT EXISTS order_ready_correction_template TEXT NOT NULL DEFAULT
    'Bonjour, nous sommes désolés : une erreur s''est produite. Votre commande n''est pas encore prête. Nous vous préviendrons dès qu''elle sera disponible.';
