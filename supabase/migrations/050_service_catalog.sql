-- ─── 050 : Service catalog (soins) + cabins ─────────────────────────────────
--
-- A business has cabins (treatment rooms). Each service (soin) belongs to one
-- cabin and has a price and a duration (cleaning time included).
-- An appointment holds 1+ services of the same cabin; its duration is the sum
-- of the service durations. Two appointments cannot overlap in the same cabin.
--
-- appointment_services snapshots name/price/duration at booking time so that
-- editing the catalog never changes past appointments.

-- 1. Cabins
CREATE TABLE IF NOT EXISTS cabins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cabins_business_idx
  ON cabins (business_id, sort_order)
  WHERE deleted_at IS NULL;

-- 2. Services (soins)
CREATE TABLE IF NOT EXISTS services (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL,
  cabin_id         UUID          NOT NULL REFERENCES cabins(id) ON DELETE RESTRICT,
  name             TEXT          NOT NULL,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_minutes INTEGER       NOT NULL CHECK (duration_minutes > 0),
  sort_order       INTEGER       NOT NULL DEFAULT 0,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS services_business_idx
  ON services (business_id, cabin_id, sort_order)
  WHERE deleted_at IS NULL;

-- 3. Appointment ↔ services (with snapshot)
CREATE TABLE IF NOT EXISTS appointment_services (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID          NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id       UUID          REFERENCES services(id) ON DELETE SET NULL,
  position         INTEGER       NOT NULL DEFAULT 0,
  name             TEXT          NOT NULL,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER       NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_services_appt_idx
  ON appointment_services (appointment_id, position);

-- 4. Cabin on appointments (NULL = legacy appointment → blocks every cabin)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cabin_id UUID REFERENCES cabins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_cabin_scheduled_idx
  ON appointments (cabin_id, scheduled_at)
  WHERE deleted_at IS NULL;

-- 5. RLS — same pattern as 041/047 (service role bypasses, direct access denied)
ALTER TABLE public.cabins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all" ON public.cabins               AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.services             AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.appointment_services AS RESTRICTIVE USING (false);
