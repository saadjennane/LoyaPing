-- ============================================================
-- 032 — Legacy appointments schema — soft cleanup
--
-- The appointment reminders system was rewritten to use the
-- scheduled_messages outbox pattern (migration 024).
-- The tables and columns below have NOT been written to since
-- that refactor, and are kept solely for safe rollback.
--
-- This migration does two things:
--   A) Adds COMMENT ON so any DB tool immediately surfaces the
--      deprecation notice.
--   B) Attaches BEFORE INSERT/UPDATE/DELETE triggers that raise
--      a clear exception if any code accidentally writes to a
--      legacy table. Reads (SELECT) are unaffected.
--
-- Why triggers instead of RLS?
--   The application uses the Supabase service_role key, which
--   bypasses RLS entirely. Triggers are enforced at the
--   database level for all roles, including service_role.
-- ============================================================

-- ── A. COMMENT ON — legacy tables ────────────────────────────────────────────

COMMENT ON TABLE reminder_configs IS
  'LEGACY — deprecated since outbox refactor (migration 024). '
  'Not written by the application. Kept for safe rollback only. '
  'Use appointment_notification_settings + scheduled_messages instead.';

COMMENT ON TABLE reminder_sends IS
  'LEGACY — deprecated since outbox refactor (migration 024). '
  'Not written by the application. Kept for safe rollback only. '
  'Use scheduled_messages for reminder tracking instead.';

COMMENT ON TABLE appointment_notifications IS
  'LEGACY — created in migration 018 but never used by the application. '
  'Kept for safe rollback only. '
  'Use scheduled_messages for appointment notification tracking instead.';

-- ── A. COMMENT ON — legacy columns on appointments ───────────────────────────

COMMENT ON COLUMN appointments.reminder1_sent_at IS
  'LEGACY — not written since outbox refactor. '
  'Use scheduled_messages (message_type=appointment_reminder_1) instead.';

COMMENT ON COLUMN appointments.reminder2_sent_at IS
  'LEGACY — not written since outbox refactor. '
  'Use scheduled_messages (message_type=appointment_reminder_2) instead.';

COMMENT ON COLUMN appointments.reminder3_sent_at IS
  'LEGACY — not written since outbox refactor. '
  'Use scheduled_messages (message_type=appointment_reminder_3) instead.';

COMMENT ON COLUMN appointments.reminders_count IS
  'LEGACY — not updated since outbox refactor. '
  'Query scheduled_messages for reminder counts instead.';

-- ── B. Write-blocking trigger function ───────────────────────────────────────
--
-- Single shared function; TG_TABLE_NAME surfaces the offending table
-- in the error message so the caller knows exactly what to fix.

CREATE OR REPLACE FUNCTION lp_legacy_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Writes to legacy table "%" are disabled (migration 032). '
    'This table is deprecated since the outbox refactor. '
    'Use the scheduled_messages outbox pattern instead.',
    TG_TABLE_NAME;
END;
$$;

-- ── B. Attach guards to legacy tables ────────────────────────────────────────
--
-- DROP ... IF EXISTS first so this migration is idempotent on re-run.

DROP TRIGGER IF EXISTS guard_reminder_configs_writes       ON reminder_configs;
DROP TRIGGER IF EXISTS guard_reminder_sends_writes         ON reminder_sends;
DROP TRIGGER IF EXISTS guard_appointment_notifications_writes ON appointment_notifications;

CREATE TRIGGER guard_reminder_configs_writes
  BEFORE INSERT OR UPDATE OR DELETE ON reminder_configs
  FOR EACH ROW EXECUTE FUNCTION lp_legacy_write_guard();

CREATE TRIGGER guard_reminder_sends_writes
  BEFORE INSERT OR UPDATE OR DELETE ON reminder_sends
  FOR EACH ROW EXECUTE FUNCTION lp_legacy_write_guard();

CREATE TRIGGER guard_appointment_notifications_writes
  BEFORE INSERT OR UPDATE OR DELETE ON appointment_notifications
  FOR EACH ROW EXECUTE FUNCTION lp_legacy_write_guard();
