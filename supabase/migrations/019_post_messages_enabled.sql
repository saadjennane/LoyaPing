-- =========================================
-- 019_post_messages_enabled.sql
-- =========================================

ALTER TABLE appointment_notification_settings
  ADD COLUMN IF NOT EXISTS post_messages_enabled BOOLEAN NOT NULL DEFAULT true;
