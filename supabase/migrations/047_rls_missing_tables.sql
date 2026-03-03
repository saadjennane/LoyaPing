-- ─── 047 : Enable RLS on tables added after migration 039 ────────────────────
--
-- Tables created in migrations 042-045 were missing RLS.
-- Same pattern as 039 + 041: service role bypasses RLS, so these policies
-- simply block any direct anon/PostgREST access.

ALTER TABLE public.availability_exceptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_events            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all" ON public.availability_exceptions  AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.reviews_events           AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.review_settings          AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.appointment_events       AS RESTRICTIVE USING (false);
CREATE POLICY "deny_all" ON public.urgent_events            AS RESTRICTIVE USING (false);
