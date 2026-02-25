-- ─── 039 : Enable RLS on all public tables + fix v_clients SECURITY DEFINER ──
--
-- Context: LoyaPing is a single-tenant app. All server-side queries use the
-- Supabase service role key, which bypasses RLS entirely. Enabling RLS with
-- no policies blocks any direct access via the anon key / PostgREST, which is
-- the correct security posture.

-- ── Enable RLS on every public table flagged by the Security Advisor ──────────

ALTER TABLE public.businesses                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_tiers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_configs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_sends                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_log                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_modules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_scheduled_notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_integrations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redeem_sessions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_field_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_sends                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profile                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_imports                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_watch_channels         ENABLE ROW LEVEL SECURITY;

-- No policies are needed: the service role key (used server-side) bypasses RLS.
-- Any direct anon/user access via PostgREST will be blocked by default.

-- ── Fix v_clients : SECURITY INVOKER (pg 15+) ────────────────────────────────
-- Recreate the view with security_invoker so it runs with the calling user's
-- permissions rather than the view creator's, satisfying the linter.

CREATE OR REPLACE VIEW public.v_clients WITH (security_invoker = true) AS
SELECT
  c.*,
  GREATEST(
    (SELECT MAX(o.created_at) FROM orders o
      WHERE o.client_id = c.id AND o.deleted_at IS NULL),
    (SELECT MAX(a.created_at) FROM appointments a
      WHERE a.client_id = c.id AND a.deleted_at IS NULL)
  ) AS last_activity
FROM clients c;
