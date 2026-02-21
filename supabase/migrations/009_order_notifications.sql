-- =========================================
-- 009_order_notifications.sql
-- =========================================

-- 1. New columns on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder3_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminders_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;

-- 2. Update status CHECK constraint to allow 'completed'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'ready', 'picked_up', 'completed'));

-- 3. Migrate picked_up → completed
UPDATE orders
SET status = 'completed', completed_at = picked_up_at
WHERE status = 'picked_up';

-- 4. Order notification settings
CREATE TABLE IF NOT EXISTS order_notification_settings (
  business_id           UUID    PRIMARY KEY,
  ready_message         TEXT    NOT NULL DEFAULT 'Bonjour ! Votre commande #{reference} est prête. Vous pouvez venir la récupérer. Merci !',
  reminder1_enabled     BOOLEAN NOT NULL DEFAULT true,
  reminder1_delay_value INT     NOT NULL DEFAULT 2,
  reminder1_delay_unit  TEXT    NOT NULL DEFAULT 'hours',
  reminder1_message     TEXT    NOT NULL DEFAULT 'Rappel : votre commande #{reference} est toujours disponible.',
  reminder2_enabled     BOOLEAN NOT NULL DEFAULT false,
  reminder2_delay_value INT     NOT NULL DEFAULT 24,
  reminder2_delay_unit  TEXT    NOT NULL DEFAULT 'hours',
  reminder2_message     TEXT    NOT NULL DEFAULT '',
  reminder3_enabled     BOOLEAN NOT NULL DEFAULT false,
  reminder3_delay_value INT     NOT NULL DEFAULT 48,
  reminder3_delay_unit  TEXT    NOT NULL DEFAULT 'hours',
  reminder3_message     TEXT    NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Bootstrap default settings for the default business
INSERT INTO order_notification_settings (business_id, ready_message, reminder1_message)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bonjour ! Votre commande #{reference} est prête. Vous pouvez venir la récupérer. Merci !',
  'Rappel : votre commande #{reference} est toujours disponible.'
)
ON CONFLICT (business_id) DO NOTHING;
