-- Runs once on first container init (empty data dir), via
-- /docker-entrypoint-initdb.d. POSTGRES_DB already created `scheduler`.

-- Test database used by the backend e2e suite (resolveTestDatabaseUrl).
CREATE DATABASE scheduler_test;

-- gen_random_uuid() needs pgcrypto. Migrations also ensure this, but enabling
-- it up front keeps a fresh DB ready before the first migration runs.
\connect scheduler
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\connect scheduler_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
