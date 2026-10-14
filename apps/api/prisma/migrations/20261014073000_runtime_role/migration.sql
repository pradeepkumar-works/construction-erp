-- A database role for the running API that row-level security applies to (roadmap D16 follow-up).
-- The owner role that runs migrations (on Neon it is created with BYPASSRLS) skips every policy, so
-- /api/health reports tenantGuard "bypassed" while the API connects as it. erp_runtime has no BYPASSRLS and
-- owns nothing: it can read and write rows, the tenant_isolation policies apply to it, and it cannot change
-- the schema. It is created without LOGIN; whoever runs the database gives it a password once, by hand
-- (ALTER ROLE erp_runtime LOGIN PASSWORD '...'), then points DATABASE_URL at it and keeps the owner in
-- MIGRATE_DATABASE_URL for migrations and the seed. Until then nothing changes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_runtime') THEN
    CREATE ROLE erp_runtime NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO erp_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_runtime;
REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM erp_runtime;

-- Tables and sequences that later migrations create (as the owner) get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_runtime;
