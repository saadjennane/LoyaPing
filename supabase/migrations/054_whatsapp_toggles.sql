-- ─── 054 : Per-appointment and per-client WhatsApp toggles ──────────────────
--
-- appointments.whatsapp_enabled = false → no reminder / post-visit message
--   for that appointment.
-- clients.whatsapp_enabled = false → no automated WhatsApp message at all to
--   that client (checked at send time, so it also covers queued messages).
--   Manual replies typed by the merchant in a conversation are still allowed.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS clients_whatsapp_disabled_idx
  ON clients (phone_number)
  WHERE whatsapp_enabled = false;

-- v_clients expands c.* at creation time: recreate it so it exposes the new
-- column (same definition as migration 039).
DROP VIEW IF EXISTS public.v_clients;
CREATE VIEW public.v_clients WITH (security_invoker = true) AS
SELECT
  c.*,
  GREATEST(
    (SELECT MAX(o.created_at) FROM orders o
      WHERE o.client_id = c.id AND o.deleted_at IS NULL),
    (SELECT MAX(a.created_at) FROM appointments a
      WHERE a.client_id = c.id AND a.deleted_at IS NULL)
  ) AS last_activity
FROM clients c;
