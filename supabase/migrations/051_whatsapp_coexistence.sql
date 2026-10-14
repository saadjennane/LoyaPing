-- ─── 051 : WhatsApp Cloud API (Coexistence) ─────────────────────────────────
--
-- 1. whatsapp_windows: last inbound message per phone. Meta only accepts
--    free-form messages within 24 h of the client's last message; outside
--    that window an approved template must be used.
-- 2. scheduled_messages.template: fallback template (name, language, params,
--    button payloads) used by the dispatcher when the window is closed.

CREATE TABLE IF NOT EXISTS whatsapp_windows (
  phone           TEXT        PRIMARY KEY,   -- E.164, e.g. +212612345678
  last_inbound_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE scheduled_messages
  ADD COLUMN IF NOT EXISTS template JSONB;

ALTER TABLE public.whatsapp_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON public.whatsapp_windows AS RESTRICTIVE USING (false);
