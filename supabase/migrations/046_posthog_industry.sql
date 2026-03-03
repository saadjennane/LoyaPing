-- Add industry field to business_profile for PostHog analytics segmentation
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS industry TEXT;
