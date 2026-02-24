-- Add microsoft_event_id to appointments for bidirectional Outlook Calendar sync
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS microsoft_event_id TEXT UNIQUE;
