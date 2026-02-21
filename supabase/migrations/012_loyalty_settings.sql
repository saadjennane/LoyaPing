-- =========================================
-- 012_loyalty_settings.sql
-- =========================================

-- 1. New columns on loyalty_programs
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS points_per_visit              INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS conversion_amount_per_point   NUMERIC,          -- X unités = 1 point (ex: 10 MAD → 1 pt)
  ADD COLUMN IF NOT EXISTS notify_on_tier               BOOLEAN NOT NULL DEFAULT true;

-- 2. New columns on loyalty_tiers
ALTER TABLE loyalty_tiers
  ADD COLUMN IF NOT EXISTS reward_title                   TEXT,
  ADD COLUMN IF NOT EXISTS notification_message_template  TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_enabled                     BOOLEAN NOT NULL DEFAULT true;

-- 3. Make validity_days nullable (no expiry option)
ALTER TABLE loyalty_tiers ALTER COLUMN validity_days DROP NOT NULL;
ALTER TABLE loyalty_tiers ALTER COLUMN validity_days DROP DEFAULT;

-- 4. Add amount to appointments (service montant)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS amount NUMERIC;
