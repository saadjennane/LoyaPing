-- Allow appointments without a client (e.g. calendar imports from Google/Outlook
-- where no matching client was found by email). The client can be assigned later
-- via the "Assigner un client" action in the agenda.

ALTER TABLE appointments ALTER COLUMN client_id DROP NOT NULL;
