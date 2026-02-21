-- ─── 023 : Birthday reward ────────────────────────────────────────────────────

-- 1. Config cadeau anniversaire sur le programme de fidélité
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS birthday_reward_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_reward_title      TEXT,
  ADD COLUMN IF NOT EXISTS birthday_message_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_message_template  TEXT;

-- 2. Source sur les coupons pour traçabilité et déduplication
--    'tier_unlock' | 'birthday' | 'manual' | null (legacy)
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS source TEXT;
