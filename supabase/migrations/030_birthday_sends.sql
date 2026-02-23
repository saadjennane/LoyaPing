-- ============================================================
-- 030 — birthday_sends
--
-- Registre d'audit et de déduplication forte pour les envois
-- d'anniversaire.
--
-- Garanties :
--   - UNIQUE(business_id, client_id, year) → au maximum un envoi
--     par client par an, race-condition safe (contrainte DB, pas
--     application-level SELECT+INSERT).
--   - scheduled_message_id → lien vers l'entrée outbox ; NULL
--     signale un crash entre la création du coupon et l'insertion
--     du message (trigger de crash-recovery au prochain run).
--   - timezone + send_hour → snapshot de la config au moment de
--     l'envoi pour audit.
-- ============================================================

-- 1) Table de recensement
CREATE TABLE IF NOT EXISTS birthday_sends (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id            UUID        NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  year                 INT         NOT NULL,          -- année locale du business
  send_hour            INT         NOT NULL,          -- heure locale configurée au moment de l'envoi
  timezone             TEXT        NOT NULL,          -- timezone business (audit)
  scheduled_message_id UUID        NULL REFERENCES scheduled_messages(id) ON DELETE SET NULL,
  status               TEXT        NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED | SKIPPED | FAILED
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at              TIMESTAMPTZ NULL
);

-- 2) Déduplication forte — une seule ligne par (business, client, année)
CREATE UNIQUE INDEX IF NOT EXISTS birthday_sends_unique
  ON birthday_sends (business_id, client_id, year);

-- 3) Index de requêtage
CREATE INDEX IF NOT EXISTS birthday_sends_business_year
  ON birthday_sends (business_id, year);

CREATE INDEX IF NOT EXISTS birthday_sends_status
  ON birthday_sends (status);
