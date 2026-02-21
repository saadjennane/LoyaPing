-- ============================================================
-- 025 — lp_cancel_appointment_reminders
--
-- Atomically cancels all future SCHEDULED outbox entries for a
-- given appointment. Called at:
--   • appointment reschedule (before inserting new reminders)
--   • appointment soft-delete
--
-- Only touches rows that:
--   - belong to this appointment (entity_type + entity_id)
--   - are still in SCHEDULED status  (not yet claimed/sent)
--   - have a send_at in the future   (stale past entries are left as-is)
--
-- Returns the number of rows cancelled (INT) so callers can log it.
-- ============================================================

CREATE OR REPLACE FUNCTION lp_cancel_appointment_reminders(
  p_appointment_id UUID
)
RETURNS INT
LANGUAGE sql
AS $$
  WITH cancelled AS (
    UPDATE scheduled_messages
    SET
      status       = 'CANCELLED',
      cancelled_at = now(),
      updated_at   = now()
    WHERE entity_type = 'appointment'
      AND entity_id   = p_appointment_id
      AND status      = 'SCHEDULED'
      AND send_at     > now()      -- don't touch rows whose time has already passed
    RETURNING id
  )
  SELECT count(*)::INT FROM cancelled;
$$;
