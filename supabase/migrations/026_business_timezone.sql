-- ============================================================
-- 026 — Business timezone
--
-- Adds a timezone field to business_profile so that scheduled
-- WhatsApp messages (appointment reminders, birthday messages)
-- can be sent at the correct local time.
--
-- Default: 'Africa/Casablanca' (Moroccan business assumption).
-- CHECK constraint prevents empty strings; IANA validation
-- is enforced at the API layer (Intl.DateTimeFormat check).
-- ============================================================

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Casablanca'
    CHECK (timezone <> '');
