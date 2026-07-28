-- Intentionally tiny: this app stores no resume content or match results
-- (those live in Redis with a short TTL - see the root README). Postgres
-- only ever holds accounts and a daily rate-limit counter, so it doesn't
-- grow with usage over time.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  search_date DATE NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, search_date)
);
