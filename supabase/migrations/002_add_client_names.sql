-- LoyaPing Phase 1 - Add first_name and last_name to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS civility   TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;
