-- ─── 033 : Colonne source sur coupons ───────────────────────────────────────
-- Ajoute la colonne source manquante (définie dans 023 mais non migrée en prod)
-- 'tier_unlock' | 'birthday' | 'manual' | null (legacy)

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS source TEXT;
