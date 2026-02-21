-- =========================================
-- 011_calendar_integrations.sql
-- =========================================

CREATE TABLE IF NOT EXISTS calendar_integrations (
  business_id   UUID        NOT NULL,
  provider      TEXT        NOT NULL,  -- 'google' | 'microsoft'
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  token_expiry  TIMESTAMPTZ,
  account_email TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, provider)
);
