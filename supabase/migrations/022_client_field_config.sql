-- ─── 022 : Client field config ────────────────────────────────────────────────

-- 1. Nouveaux champs optionnels sur la table clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS notes    TEXT;

-- 2. Table de configuration par organisation (flat booleans, type-safe)
CREATE TABLE IF NOT EXISTS client_field_config (
  business_id          UUID    PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  detail_email         BOOLEAN NOT NULL DEFAULT true,
  detail_birthday      BOOLEAN NOT NULL DEFAULT false,
  detail_notes         BOOLEAN NOT NULL DEFAULT false,
  detail_last_activity BOOLEAN NOT NULL DEFAULT false,
  list_email           BOOLEAN NOT NULL DEFAULT false,
  list_birthday        BOOLEAN NOT NULL DEFAULT false,
  list_last_activity   BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Config par défaut pour le business de démo
INSERT INTO client_field_config (business_id)
  VALUES ('00000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;

-- 4. Vue v_clients : enrichit chaque client avec last_activity
--    (max entre la dernière commande et le dernier rendez-vous)
CREATE OR REPLACE VIEW v_clients AS
SELECT
  c.*,
  GREATEST(
    (SELECT MAX(o.created_at) FROM orders o
      WHERE o.client_id = c.id AND o.deleted_at IS NULL),
    (SELECT MAX(a.created_at) FROM appointments a
      WHERE a.client_id = c.id AND a.deleted_at IS NULL)
  ) AS last_activity
FROM clients c;
