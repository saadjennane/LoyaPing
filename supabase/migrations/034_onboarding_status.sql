ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started';

-- Businesses already configured → completed (avoids re-triggering in prod)
UPDATE business_profile
  SET onboarding_status = 'completed'
  WHERE name IS NOT NULL AND name != '';
