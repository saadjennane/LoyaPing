-- Add email column to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email TEXT;
