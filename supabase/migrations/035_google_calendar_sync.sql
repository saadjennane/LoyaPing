-- Link a LoyaPing appointment to a Google Calendar event
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_event_id TEXT UNIQUE;

-- Unmatched Google Calendar events awaiting manual client assignment
CREATE TABLE IF NOT EXISTS calendar_imports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL,
  provider    TEXT        NOT NULL DEFAULT 'google',
  event_id    TEXT        NOT NULL,
  calendar_id TEXT        NOT NULL DEFAULT 'primary',
  summary     TEXT,
  description TEXT,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ,
  attendees   TEXT[],
  raw         JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, event_id)
);

-- Active Google Calendar push notification channels (expire ~7 days)
CREATE TABLE IF NOT EXISTS calendar_watch_channels (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL,
  provider    TEXT        NOT NULL DEFAULT 'google',
  channel_id  TEXT        NOT NULL UNIQUE,
  resource_id TEXT,
  calendar_id TEXT        NOT NULL DEFAULT 'primary',
  sync_token  TEXT,
  expiry_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider)
);
