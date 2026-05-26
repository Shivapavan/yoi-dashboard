import { getDb } from '@/lib/db'

// Per-IP rate limit using Postgres. Mitigates account-enumeration spray attacks
// where a single attacker tries many usernames to bypass the per-user lockout.
const WINDOW_MIN = 10
const MAX_FAILS = 20

export async function ensureRateLimitTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts_ip (
      ip            VARCHAR(64) NOT NULL,
      attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      success       BOOLEAN NOT NULL DEFAULT false
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS login_attempts_ip_lookup ON login_attempts_ip (ip, attempted_at DESC)`
}

export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// Returns null if allowed, or an error message if blocked.
export async function checkIpRateLimit(ip: string): Promise<string | null> {
  if (ip === 'unknown') return null  // can't enforce without IP; fail-open
  await ensureRateLimitTable()
  const sql = getDb()
  // Compute the cutoff timestamp in JS — INTERVAL string literals can't be parameterized.
  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000)
  const rows = await sql`
    SELECT COUNT(*)::int AS fails
    FROM login_attempts_ip
    WHERE ip = ${ip}
      AND success = false
      AND attempted_at > ${since}
  `
  const fails = Number(rows[0]?.fails ?? 0)
  if (fails >= MAX_FAILS) {
    return `Too many failed login attempts from this network. Try again in ${WINDOW_MIN} minutes.`
  }
  return null
}

export async function recordIpAttempt(ip: string, success: boolean) {
  if (ip === 'unknown') return
  try {
    const sql = getDb()
    await sql`INSERT INTO login_attempts_ip (ip, success) VALUES (${ip}, ${success})`
  } catch { /* never let rate-limit bookkeeping block login flow */ }
}
