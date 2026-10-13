-- Migration 048: Appointment reminder buttons (V1.5 completion)
--
-- Adds:
--   1. `buttons` JSONB column on scheduled_messages — stores button list for
--      interactive WhatsApp messages. NULL = plain text message (existing behaviour).
--   2. `reminderN_with_buttons` BOOLEAN columns on appointment_notification_settings
--      — per-reminder toggle to send with "Je confirme" / "Replanifier" buttons.

-- 1. scheduled_messages: button payload column
ALTER TABLE scheduled_messages
  ADD COLUMN IF NOT EXISTS buttons JSONB;

-- 2. appointment_notification_settings: per-reminder button toggles
ALTER TABLE appointment_notification_settings
  ADD COLUMN IF NOT EXISTS reminder1_with_buttons BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder2_with_buttons BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder3_with_buttons BOOLEAN NOT NULL DEFAULT false;
