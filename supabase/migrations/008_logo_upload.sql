-- Add website column to business_profile
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Create public Supabase Storage bucket for logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first to allow idempotent re-runs)
DROP POLICY IF EXISTS "logos_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "logos_service_write"  ON storage.objects;
DROP POLICY IF EXISTS "logos_service_delete" ON storage.objects;

CREATE POLICY "logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "logos_service_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "logos_service_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logos');
