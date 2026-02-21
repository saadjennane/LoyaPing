-- LoyaPing Phase 1 - Initial Schema
-- Run this in your Supabase SQL editor

-- =========================================
-- BUSINESSES
-- =========================================
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE, -- WhatsApp business number
  whatsapp_number TEXT, -- Universal number used for sending
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- CLIENTS
-- =========================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  magic_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  current_cycle_points INTEGER NOT NULL DEFAULT 0,
  total_cycles_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, phone_number)
);

CREATE INDEX idx_clients_business_id ON clients(business_id);
CREATE INDEX idx_clients_magic_token ON clients(magic_token);

-- =========================================
-- LOYALTY PROGRAMS
-- =========================================
CREATE TABLE loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('passage', 'montant')),
  currency TEXT, -- nullable if type = 'passage'
  conversion_rate NUMERIC, -- ex: 1 point per 10 MAD → 0.1
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

-- =========================================
-- LOYALTY TIERS (max 5 per business)
-- =========================================
CREATE TABLE loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tier_order INTEGER NOT NULL, -- 1..5
  required_points INTEGER NOT NULL,
  reward_description TEXT NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, tier_order),
  CONSTRAINT max_5_tiers CHECK (tier_order BETWEEN 1 AND 5)
);

CREATE INDEX idx_loyalty_tiers_business_id ON loyalty_tiers(business_id);

-- =========================================
-- COUPONS
-- =========================================
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES loyalty_tiers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  redemption_code TEXT, -- 6-digit code generated at redemption time
  redemption_code_expires_at TIMESTAMPTZ, -- 10 min window
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupons_client_id ON coupons(client_id);
CREATE INDEX idx_coupons_redemption_code ON coupons(redemption_code);

-- =========================================
-- ORDERS (Pick-up)
-- =========================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'picked_up')),
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  points_credited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_business_id ON orders(business_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);

-- =========================================
-- APPOINTMENTS
-- =========================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'show', 'no_show')),
  points_credited BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_business_id ON appointments(business_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);

-- =========================================
-- REMINDER CONFIGS (per business)
-- =========================================
CREATE TABLE reminder_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reminder_order INTEGER NOT NULL CHECK (reminder_order BETWEEN 1 AND 3),
  offset_minutes INTEGER NOT NULL, -- minutes before appointment to send
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, reminder_order)
);

-- =========================================
-- REMINDER SENDS (tracking)
-- =========================================
CREATE TABLE reminder_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_config_id UUID NOT NULL REFERENCES reminder_configs(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, reminder_config_id)
);

-- =========================================
-- POINTS LOG (for undo support)
-- =========================================
CREATE TABLE points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('order', 'appointment', 'manual', 'undo')),
  source_id UUID, -- order_id or appointment_id
  points_delta INTEGER NOT NULL,
  cycle_points_before INTEGER NOT NULL,
  cycle_points_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_points_log_client_id ON points_log(client_id);

-- =========================================
-- ROW LEVEL SECURITY (disabled for Phase 1 simplicity - use service role key)
-- Enable RLS only when adding proper auth
-- =========================================

-- =========================================
-- SEED: Default business for dev
-- =========================================
INSERT INTO businesses (id, name, phone_number)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Ma Boutique',
  '+212600000000'
) ON CONFLICT DO NOTHING;
