import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionFromCookie } from '@/lib/auth'

// Admin-only schema migration endpoint. Idempotent — safe to call repeatedly.
export async function POST() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = getDb()
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const results: string[] = []

  try {
    // 2026-05-08: bind MFA device sessions to user-agent hash + IP /24 prefix
    await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ua_hash VARCHAR(64)`
    results.push('mfa_sessions.ua_hash ready')

    await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ip_prefix VARCHAR(32)`
    results.push('mfa_sessions.ip_prefix ready')

    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}
