import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  verifyPassword, sendVerifyOtp, createSessionToken,
  setSessionCookie, getDeviceId, isPasswordExpired, recordLogin,
  getRequestFingerprint,
  LOCK_MINUTES, MAX_FAILED_ATTEMPTS, MFA_TTL_DAYS,
} from '@/lib/auth'
import { checkIpRateLimit, extractIp, recordIpAttempt } from '@/lib/ip-rate-limit'

export async function POST(req: NextRequest) {
  const ip = extractIp(req)
  const blocked = await checkIpRateLimit(ip)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 })

  const { email, password } = await req.json()
  if (!email || !password)
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 })

  const sql = getDb()
  const identifier = email.trim().toLowerCase()

  // Match by email first, fall back to username (for accounts exempt from email)
  const rows = await sql`
    SELECT id, phone, password_hash, must_change_pw, is_active, pw_changed_at,
           failed_attempts, locked_until
    FROM users
    WHERE (email = ${identifier} OR username = ${identifier})
      AND is_active = true
    LIMIT 1
  `
  const user = rows[0]

  if (!user || !user.is_active) {
    await recordIpAttempt(ip, false)
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
  }

  // Account lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000)
    return NextResponse.json({ error: `Account locked. Try again in ${mins} min.` }, { status: 403 })
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    await recordIpAttempt(ip, false)
    const attempts = (user.failed_attempts ?? 0) + 1
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null
    await sql`UPDATE users SET failed_attempts = ${attempts}, locked_until = ${lockUntil} WHERE id = ${user.id}`
    const remaining = MAX_FAILED_ATTEMPTS - attempts
    if (remaining <= 0)
      return NextResponse.json({ error: `Too many failed attempts. Account locked for ${LOCK_MINUTES} min.` }, { status: 403 })
    return NextResponse.json({ error: `Invalid username or password. ${remaining} attempt(s) remaining.` }, { status: 401 })
  }

  await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${user.id}`
  await recordIpAttempt(ip, true)

  // Force password change (temp or expired)
  const expired = isPasswordExpired(user.pw_changed_at)
  if (user.must_change_pw || expired) {
    const token = await createSessionToken(
      { sub: user.id, stage: 'change_password', sessionId: crypto.randomUUID() }, '30m',
    )
    await setSessionCookie(token, 30 * 60)
    return NextResponse.json({ redirect: `/change-password?reason=${expired ? 'expired' : 'temp'}` })
  }

  // Idempotent migration so the next two columns are guaranteed present.
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ua_hash VARCHAR(64)`
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ip_prefix VARCHAR(32)`

  // Check MFA session — must match device cookie AND (UA hash OR IP /24).
  const deviceId = await getDeviceId()
  const { uaHash, ipPref } = getRequestFingerprint(req)
  const mfaRows = await sql`
    SELECT id FROM mfa_sessions
    WHERE user_id = ${user.id}
      AND device_id = ${deviceId}
      AND expires_at > NOW()
      AND ua_hash IS NOT NULL
      AND (ua_hash = ${uaHash} OR ip_prefix = ${ipPref})
    LIMIT 1
  `
  if (mfaRows.length > 0) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
    const ua = req.headers.get('user-agent') ?? ''
    await recordLogin(user.id, ip, ua)
    const token = await createSessionToken(
      { sub: user.id, stage: 'authenticated', sessionId: crypto.randomUUID() },
    )
    await setSessionCookie(token, 24 * 60 * 60)
    return NextResponse.json({ redirect: '/' })
  }

  // Need MFA — use Twilio Verify
  await sendVerifyOtp(user.phone)

  const preToken = await createSessionToken(
    { sub: user.id, stage: 'pre_mfa', sessionId: crypto.randomUUID() }, '15m',
  )
  await setSessionCookie(preToken, 15 * 60)
  return NextResponse.json({ redirect: '/verify-mfa' })
}
