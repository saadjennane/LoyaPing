-- ─── 053 : Client phone number optional ─────────────────────────────────────
--
-- No field of the client sheet is mandatory anymore. A client without phone
-- simply receives no WhatsApp messages. UNIQUE(business_id, phone_number)
-- still applies to real numbers: Postgres treats NULLs as distinct.
-- Empty strings are normalised to NULL so they never collide.

ALTER TABLE clients ALTER COLUMN phone_number DROP NOT NULL;

UPDATE clients SET phone_number = NULL WHERE phone_number = '';
