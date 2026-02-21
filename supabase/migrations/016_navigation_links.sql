-- =========================================
-- 016_navigation_links.sql
-- Navigation deep links on business profile
-- =========================================

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS waze_url        TEXT;
