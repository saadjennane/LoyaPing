-- ─── 055 : Security hardening (Supabase security advisor) ───────────────────
--
-- The app only talks to the database from the server, with the service role
-- (which bypasses grants and RLS). The browser uses Supabase for auth only.
-- So the public roles need no access at all to the public schema.

-- 1. Storage — bucket "logos"
--    These policies had no role restriction: anyone with the public anon key
--    could list, upload and delete logos. The server uploads with the service
--    role, and a public bucket serves files by URL without any policy.
DROP POLICY IF EXISTS "logos_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "logos_service_write"  ON storage.objects;
DROP POLICY IF EXISTS "logos_service_delete" ON storage.objects;

-- 2. Tables / views exposed in the GraphQL schema (lints 0026 / 0027)
--    RLS "deny_all" already blocked the rows; this also hides the objects.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 3. RPC functions (e.g. claim_due_scheduled_messages) — server only
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, public;

-- 4. Same for objects created by future migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;

-- 5. The server (service role) keeps full access — explicit, so nothing
--    depends on what PUBLIC used to grant.
GRANT ALL     ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL     ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
