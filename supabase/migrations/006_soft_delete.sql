-- Soft delete for orders and appointments
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
