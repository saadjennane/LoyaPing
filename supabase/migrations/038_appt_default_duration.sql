-- Default duration (in minutes) for appointments created in LoyaPing.
-- When set, the end time is auto-computed from start time + duration.
-- NULL means no default (user must set end time manually).

ALTER TABLE appointment_notification_settings
  ADD COLUMN IF NOT EXISTS default_duration_minutes INTEGER DEFAULT NULL;
