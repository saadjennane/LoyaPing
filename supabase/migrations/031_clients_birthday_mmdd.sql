-- ============================================================
-- 031 — clients.birthday_mmdd (generated column + index)
--
-- Adds a STORED generated column birthday_mmdd TEXT that holds
-- to_char(birthday, 'MM-DD'), allowing the birthday cron to
-- filter clients by month/day directly in SQL instead of pulling
-- all clients into Node.js and filtering in JavaScript.
--
-- Before: SELECT all clients WHERE birthday IS NOT NULL  (~N rows)
--         then JS filter substring(5) === 'MM-DD'
--
-- After:  SELECT clients WHERE birthday_mmdd = 'MM-DD'  (~N/365 rows)
--         using the composite index (business_id, birthday_mmdd).
--
-- The column is NULL when birthday is NULL — no separate IS NOT NULL
-- guard needed (EQ on NULL never matches a concrete 'MM-DD' value).
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birthday_mmdd TEXT
    GENERATED ALWAYS AS (to_char(birthday, 'MM-DD')) STORED;

-- Composite index for the cron query pattern:
--   WHERE business_id = ? AND birthday_mmdd = 'MM-DD'
CREATE INDEX IF NOT EXISTS idx_clients_birthday_mmdd
  ON clients (business_id, birthday_mmdd)
  WHERE birthday_mmdd IS NOT NULL;
