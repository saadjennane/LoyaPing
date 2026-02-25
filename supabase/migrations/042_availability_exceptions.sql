-- Availability exceptions (unavailability periods)
-- Blocks slot suggestions without preventing manual booking

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,          -- same as start_date for single-day
  start_time   TEXT,                          -- 'HH:MM' — null = full day
  end_time     TEXT,                          -- 'HH:MM' — null = full day
  label        TEXT,                          -- optional description
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS availability_exceptions_business_dates_idx
  ON availability_exceptions(business_id, start_date, end_date);
