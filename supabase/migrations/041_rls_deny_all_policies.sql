-- ─── 041 : Add explicit deny-all RLS policies ────────────────────────────────
--
-- RLS is enabled on all tables (migration 039) but Supabase flags tables with
-- no policies as an INFO warning. Adding USING (false) policies makes the
-- "deny all direct access" intent explicit and silences the linter.
--
-- These policies have NO effect on server-side queries because the service role
-- key bypasses RLS entirely. They only block direct anon/user access via PostgREST.

CREATE POLICY "deny_all" ON public.businesses                      AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.loyalty_programs                AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.loyalty_tiers                   AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.coupons                         AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.orders                          AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.reminder_configs                AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.reminder_sends                  AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.points_log                      AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.order_notification_settings     AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.appointments                    AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.clients                         AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.appointment_notification_settings AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.business_hours                  AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.business_modules                AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.order_scheduled_notifications   AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.calendar_integrations           AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.order_messages                  AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.redeem_sessions                 AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.appointment_notifications       AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.client_field_config             AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.birthday_sends                  AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.scheduled_messages              AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.business_profile                AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.calendar_imports                AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.calendar_watch_channels         AS RESTRICTIVE USING (false);
