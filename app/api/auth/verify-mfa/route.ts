import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  checkVerifyOtp, createSessionToken, setSessionCookie, getDeviceId,
  getSessionFromCookie, recordLogin, getRequestFingerprint, MFA_TTL_DAYS,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'pre_mfa')
    return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })

  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: 'Code required.' }, { status: 400 })

  const sql = getDb()
  const userRows = await sql`SELECT id, phone FROM users WHERE id = ${session.sub}`
  if (!userRows.length) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  const valid = await checkVerifyOtp(userRows[0].phone, code.trim())
  if (!valid) return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 })

  // Idempotent migration — ensures the device-binding columns exist before insert.
  // ALTER TABLE IF NOT EXISTS is fast (~1ms) once columns are present.
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ua_hash VARCHAR(64)`
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ip_prefix VARCHAR(32)`

  // Bind this MFA session to device + UA fingerprint + IP /24 prefix
  const deviceId = await getDeviceId()
  const { uaHash, ipPref } = getRequestFingerprint(req)
  const expiresAt = new Date(Date.now() + MFA_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await sql`
    INSERT INTO mfa_sessions (user_id, device_id, expires_at, ua_hash, ip_prefix)
    VALUES (${session.sub}, ${deviceId}, ${expiresAt}, ${uaHash}, ${ipPref})
    ON CONFLICT (user_id, device_id) DO UPDATE SET
      verified_at = NOW(),
      expires_at  = ${expiresAt},
      ua_hash     = ${uaHash},
      ip_prefix   = ${ipPref}
  `

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? ''
  await recordLogin(session.sub, ip, ua)

  const token = await createSessionToken(
    { sub: session.sub, stage: 'authenticated', sessionId: crypto.randomUUID() },
  )
  await setSessionCookie(token, 24 * 60 * 60)
  return NextResponse.json({ redirect: '/' })
}
