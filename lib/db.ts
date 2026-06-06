import { neon } from '@neondatabase/serverless'

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return neon(url)
}

// Run once at setup: node -e "require('./scripts/init-db.mjs')"
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        VARCHAR(50)  UNIQUE NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  password_hash   TEXT         NOT NULL,
  must_change_pw  BOOLEAN      NOT NULL DEFAULT true,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  is_admin        BOOLEAN      NOT NULL DEFAULT false,
  created_by      VARCHAR(50),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  pw_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  failed_attempts INTEGER      NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mfa_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(100) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mfa_sessions_user_device ON mfa_sessions(user_id, device_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  purpose    VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_bookings (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE         NOT NULL,
  name       TEXT         NOT NULL,
  party_size INTEGER,
  start_time TEXT,
  phone      TEXT,
  status     TEXT         NOT NULL DEFAULT 'Tentative',
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS event_bookings_date_idx ON event_bookings(date);
`
