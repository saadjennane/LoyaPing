-- Migration 044: Appointment confirmation & reschedule V1.5

-- Add new columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stored_previous_date       DATE,
  ADD COLUMN IF NOT EXISTS stored_previous_time       TIME;

-- Update status column to accept new values
-- (existing: scheduled, show, no_show — we add confirmed, reschedule_requested)
-- No enum to alter; status is TEXT, so just document valid values here.
-- Application enforces valid status values.

-- appointment_events table
CREATE TABLE IF NOT EXISTS appointment_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL CHECK (type IN ('reminder_sent', 'confirmed', 'reschedule_requested')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_events_appointment_id_idx
  ON appointment_events (appointment_id);
