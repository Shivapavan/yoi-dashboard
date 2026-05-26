import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  verifyPassword, hashPassword, isPasswordInHistory, validatePasswordPolicy,
  getSessionFromCookie, createSessionToken, setSessionCookie,
  sendVerifyOtp, getDeviceId, getRequestFingerprint,
  PASSWORD_HISTORY_KEEP, MFA_TTL_DAYS,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || !['change_password', 'authenticated', 'forgot_password'].includes(session.stage))
    return NextResponse.json({ error: 'Session expired.' }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()
  if (!newPassword) return NextResponse.json({ error: 'New password required.' }, { status: 400 })

  const policyErr = validatePasswordPolicy(newPassword)
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 })

  const sql = getDb()
  const rows = await sql`SELECT id, phone, password_hash FROM users WHERE id = ${session.sub}`
  const user = rows[0]
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  if (session.stage === 'authenticated') {
    if (!currentPassword)
      return NextResponse.json({ error: 'Current password required.' }, { status: 400 })
    const valid = await verifyPassword(currentPassword, user.password_hash)
    if (!valid)
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
  }

  // Check password history
  const histRows = await sql`
    SELECT password_hash FROM password_history
    WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT ${PASSWORD_HISTORY_KEEP}
  `
  const allHashes = [user.password_hash, ...histRows.map((r: any) => r.password_hash)]
  if (await isPasswordInHistory(newPassword, allHashes))
    return NextResponse.json({ error: 'This password was used before. Choose a different one.' }, { status: 400 })

  await sql`INSERT INTO password_history (user_id, password_hash) VALUES (${user.id}, ${user.password_hash})`
  await sql`
    DELETE FROM password_history WHERE id IN (
      SELECT id FROM password_history WHERE user_id = ${user.id}
      ORDER BY created_at DESC OFFSET ${PASSWORD_HISTORY_KEEP}
    )
  `

  const newHash = await hashPassword(newPassword)
  await sql`UPDATE users SET password_hash = ${newHash}, must_change_pw = false, pw_changed_at = NOW() WHERE id = ${user.id}`

  // Check MFA session
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ua_hash VARCHAR(64)`
  await sql`ALTER TABLE mfa_sessions ADD COLUMN IF NOT EXISTS ip_prefix VARCHAR(32)`

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
    const token = await createSessionToken(
      { sub: user.id, stage: 'authenticated', sessionId: crypto.randomUUID() },
    )
    await setSessionCookie(token, 24 * 60 * 60)
    return NextResponse.json({ redirect: '/' })
  }

  // Need MFA
  await sendVerifyOtp(user.phone)
  const preToken = await createSessionToken(
    { sub: user.id, stage: 'pre_mfa', sessionId: crypto.randomUUID() }, '15m',
  )
  await setSessionCookie(preToken, 15 * 60)
  return NextResponse.json({ redirect: '/verify-mfa' })
}
