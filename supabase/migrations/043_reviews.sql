-- Reviews module V1
-- Events timeline + client review state

-- ── reviews_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL CHECK (type IN (
                                'request_sent',
                                'positive_response',
                                'negative_response',
                                'google_intent',
                                'reminder_sent',
                                'confirmed'
                              )),
  message_content TEXT,
  treated         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviews_events_business_idx
  ON reviews_events(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_events_client_idx
  ON reviews_events(client_id);

-- ── review_settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_settings (
  business_id                   UUID    PRIMARY KEY,
  is_active                     BOOLEAN NOT NULL DEFAULT false,
  min_interactions              INT     NOT NULL DEFAULT 3,
  delay_after_interaction_hours INT     NOT NULL DEFAULT 24,
  satisfaction_message          TEXT    NOT NULL DEFAULT 'Bonjour {name} ! Étiez-vous satisfait(e) de votre dernière visite ?',
  positive_message              TEXT    NOT NULL DEFAULT 'Super ! Vous pouvez nous laisser un avis ici 🙏',
  negative_message              TEXT    NOT NULL DEFAULT 'Merci pour votre retour. Nous allons y remédier rapidement !',
  reminder_enabled              BOOLEAN NOT NULL DEFAULT false,
  reminder_delay_hours          INT     NOT NULL DEFAULT 48,
  google_review_link            TEXT,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Columns added to clients ─────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS review_intent          BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS review_confirmed       BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_review_request_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS review_reminder_sent   BOOLEAN     NOT NULL DEFAULT false;

-- ── reviews_enabled added to business_modules ────────────────────────────────
ALTER TABLE business_modules ADD COLUMN IF NOT EXISTS reviews_enabled BOOLEAN NOT NULL DEFAULT false;
