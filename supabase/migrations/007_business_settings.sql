-- =========================================
-- BUSINESS PROFILE (infos entreprise)
-- =========================================
CREATE TABLE IF NOT EXISTS business_profile (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  logo_url    TEXT,
  phone       TEXT,
  email       TEXT,
  currency    TEXT NOT NULL DEFAULT 'MAD',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- BUSINESS HOURS (horaires d'ouverture)
-- day_of_week: 1=Lundi … 7=Dimanche
-- =========================================
CREATE TABLE IF NOT EXISTS business_hours (
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_closed    BOOLEAN NOT NULL DEFAULT false,
  slot1_start  TIME,
  slot1_end    TIME,
  slot2_start  TIME,
  slot2_end    TIME,
  PRIMARY KEY (business_id, day_of_week)
);

-- =========================================
-- BUSINESS MODULES (ON/OFF)
-- Constraint: at least one module must be active
-- =========================================
CREATE TABLE IF NOT EXISTS business_modules (
  business_id          UUID    PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  orders_enabled       BOOLEAN NOT NULL DEFAULT true,
  appointments_enabled BOOLEAN NOT NULL DEFAULT true,
  loyalty_enabled      BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT at_least_one_module CHECK (
    orders_enabled OR appointments_enabled OR loyalty_enabled
  )
);

-- =========================================
-- BOOTSTRAP: default business
-- =========================================
INSERT INTO business_profile (business_id, name, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Ma Boutique', 'MAD')
ON CONFLICT DO NOTHING;

-- Default hours: Mon-Sat 09:00-18:00, Sun closed
INSERT INTO business_hours (business_id, day_of_week, is_closed, slot1_start, slot1_end)
SELECT
  '00000000-0000-0000-0000-000000000001',
  gs.day,
  CASE WHEN gs.day = 7 THEN true  ELSE false    END,
  CASE WHEN gs.day = 7 THEN NULL  ELSE '09:00'::TIME END,
  CASE WHEN gs.day = 7 THEN NULL  ELSE '18:00'::TIME END
FROM generate_series(1, 7) AS gs(day)
ON CONFLICT DO NOTHING;

-- Default modules: all enabled
INSERT INTO business_modules (business_id, orders_enabled, appointments_enabled, loyalty_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', true, true, true)
ON CONFLICT DO NOTHING;
