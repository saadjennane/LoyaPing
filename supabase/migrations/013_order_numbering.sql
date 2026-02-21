-- =========================================
-- 013_order_numbering.sql
-- Custom order numbering per business
-- =========================================

-- Add numbering config to business_profile
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS order_number_prefix TEXT NOT NULL DEFAULT 'CMD',
  ADD COLUMN IF NOT EXISTS order_number_next   INT  NOT NULL DEFAULT 1;

-- Make reference nullable on orders (client can omit it)
ALTER TABLE orders
  ALTER COLUMN reference DROP NOT NULL;
