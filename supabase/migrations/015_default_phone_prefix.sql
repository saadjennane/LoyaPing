-- =========================================
-- 015_default_phone_prefix.sql
-- Default phone country code on business profile
-- =========================================

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS default_phone_prefix TEXT NOT NULL DEFAULT '+33';
