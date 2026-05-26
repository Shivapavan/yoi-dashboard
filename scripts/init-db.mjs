/**
 * Run after connecting Neon to Vercel:
 *   vercel env pull .env.local --environment=production --yes
 *   node scripts/init-db.mjs
 */
import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'

// Read DATABASE_URL from .env.local
let dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  try {
    const env = readFileSync('.env.local', 'utf8')
    const match = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)
    if (match) dbUrl = match[1]
  } catch {}
}

if (!dbUrl) {
  console.error('❌ DATABASE_URL not found. Run: vercel env pull .env.local --environment=production --yes')
  process.exit(1)
}

const sql = neon(dbUrl)

await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`

await sql`
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
  )
`

await sql`
  CREATE TABLE IF NOT EXISTS password_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

await sql`
  CREATE TABLE IF NOT EXISTS mfa_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id   VARCHAR(100) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
  )
`

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS mfa_sessions_user_device
  ON mfa_sessions(user_id, device_id)
`

await sql`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    purpose    VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

console.log('✅ Database schema created successfully.')
console.log('Next: create your first admin user with scripts/create-admin.mjs')
