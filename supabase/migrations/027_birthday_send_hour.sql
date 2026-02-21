-- ============================================================
-- 027 — Birthday message send hour
--
-- Adds birthday_send_hour to loyalty_programs so the birthday
-- WhatsApp message is dispatched at a specific hour (UTC) on
-- the client's birthday.
--
-- Range: 0–23. Default 9 → 9h00 UTC.
-- The birthday cron job uses this value to schedule the message.
-- ============================================================

ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS birthday_send_hour INTEGER NOT NULL DEFAULT 9
    CHECK (birthday_send_hour BETWEEN 0 AND 23);
