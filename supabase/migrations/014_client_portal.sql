-- =========================================
-- 014_client_portal.sql
-- Client portal: branding + redeem sessions
-- =========================================

-- Branding + address on business profile
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS primary_color   TEXT,   -- ex: #6366f1
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,   -- ex: #e0e7ff
  ADD COLUMN IF NOT EXISTS address         TEXT;

-- Redeem sessions: short-lived 6-digit code + QR for coupon usage
CREATE TABLE IF NOT EXISTS redeem_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   UUID        NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code6       CHAR(6)     NOT NULL,
  qr_token    TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redeem_sessions_qr_token  ON redeem_sessions(qr_token);
CREATE INDEX IF NOT EXISTS idx_redeem_sessions_coupon_id ON redeem_sessions(coupon_id);
