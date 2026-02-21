-- =========================================
-- 021_appointment_end_time.sql
-- =========================================

-- Add optional end time to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
