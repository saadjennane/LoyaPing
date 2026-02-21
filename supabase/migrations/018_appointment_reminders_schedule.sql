-- =========================================
-- 018_appointment_reminders_schedule.sql
-- =========================================

-- 1. Add fixed_send_time columns to appointment_notification_settings
--    (only applicable when delay_unit = 'days')
ALTER TABLE appointment_notification_settings
  ADD COLUMN IF NOT EXISTS reminder1_fixed_send_time TEXT,
  ADD COLUMN IF NOT EXISTS reminder2_fixed_send_time TEXT,
  ADD COLUMN IF NOT EXISTS reminder3_fixed_send_time TEXT;

-- 2. Create appointment_notifications table (deferred scheduling)
CREATE TABLE IF NOT EXISTS appointment_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  business_id     UUID        NOT NULL,
  reminder_index  SMALLINT    NOT NULL CHECK (reminder_index BETWEEN 1 AND 3),
  status          TEXT        NOT NULL DEFAULT 'SCHEDULED',
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appt_notif_status_check CHECK (status IN ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_appt_notifs_status_time ON appointment_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appt_notifs_appt ON appointment_notifications(appointment_id);
