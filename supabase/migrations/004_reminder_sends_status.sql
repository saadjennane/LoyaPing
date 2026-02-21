-- =========================================
-- Add status tracking to reminder_sends
-- =========================================
ALTER TABLE reminder_sends
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  ADD COLUMN IF NOT EXISTS error_message TEXT;
