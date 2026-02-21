-- =========================================
-- 010_appointment_notifications.sql
-- =========================================

-- 1. New columns on appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder3_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminders_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at        TIMESTAMPTZ;

-- 2. Appointment notification settings table
CREATE TABLE IF NOT EXISTS appointment_notification_settings (
  business_id           UUID    PRIMARY KEY,
  reminder1_enabled     BOOLEAN NOT NULL DEFAULT true,
  reminder1_delay_value INT     NOT NULL DEFAULT 24,
  reminder1_delay_unit  TEXT    NOT NULL DEFAULT 'hours',
  reminder1_message     TEXT    NOT NULL DEFAULT 'Bonjour ! Rappel de votre rendez-vous demain. À bientôt !',
  reminder2_enabled     BOOLEAN NOT NULL DEFAULT false,
  reminder2_delay_value INT     NOT NULL DEFAULT 2,
  reminder2_delay_unit  TEXT    NOT NULL DEFAULT 'hours',
  reminder2_message     TEXT    NOT NULL DEFAULT '',
  reminder3_enabled     BOOLEAN NOT NULL DEFAULT false,
  reminder3_delay_value INT     NOT NULL DEFAULT 30,
  reminder3_delay_unit  TEXT    NOT NULL DEFAULT 'minutes',
  reminder3_message     TEXT    NOT NULL DEFAULT '',
  post_show_message     TEXT    NOT NULL DEFAULT 'Merci pour votre visite ! À bientôt.',
  post_no_show_message  TEXT    NOT NULL DEFAULT 'Vous avez manqué votre rendez-vous. Contactez-nous pour en planifier un nouveau.',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Bootstrap default settings for the default business
INSERT INTO appointment_notification_settings (
  business_id, reminder1_message, post_show_message, post_no_show_message
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bonjour ! Rappel de votre rendez-vous demain. À bientôt !',
  'Merci pour votre visite ! À bientôt.',
  'Vous avez manqué votre rendez-vous. Contactez-nous pour en planifier un nouveau.'
)
ON CONFLICT (business_id) DO NOTHING;
